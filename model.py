from __future__ import annotations

import logging
import threading

import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer

logger = logging.getLogger(__name__)

# --- კონფიგურაცია
MODEL_NAME = "distilbert-base-uncased-finetuned-sst-2-english"
# HuggingFace მოდელის იდენტიფიკატორი
PHISHING_LABEL_INDEX = 0
# ფიშინგის შეფასების დეფაულტ ინდექსი

# მოდელისთვის გამოყენებადი ტოკენების მაქსიმალური რაოდენობა
MAX_TOKENS = 512


class PhishingClassifier:
    """ტრანსფორმერის კლასიფიკატორი. მისი ჩატვირთვა ხდება ერთხელ, მას შემდეგ კი ჩატვირთული მოდელი მუშაობს
    კომპიუტერის ოპერატიულ მეხსიერებაში და არ ხდება მისი გადატვირთვა ყველა ჯერზე, როცა ახალ მეილს ხსნის მომხმარებელი."""

    def __init__(self, model_name: str = MODEL_NAME, device: str | None = None) -> None:
        self.model_name = model_name
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")

        logger.info("Loading tokenizer + model '%s' on %s ...", model_name, self.device)
        self.tokenizer = AutoTokenizer.from_pretrained(model_name)
        self.model = AutoModelForSequenceClassification.from_pretrained(model_name)
        self.model.to(self.device)
        self.model.eval()


        self._lock = threading.Lock()
        logger.info("Model ready.")

    @torch.inference_mode()
    def predict(self, text: str) -> float:
        """
        აბრუნებს ალბათობას ფიშინგის ალბათობას(0.0-1.0)
        
        """
        if not text or not text.strip():
            return 0.0


        inputs = self.tokenizer(
            text,
            return_tensors="pt",
            truncation=True,
            max_length=MAX_TOKENS,
            padding=False,
        )
        inputs = {key: tensor.to(self.device) for key, tensor in inputs.items()}

        with self._lock:
            logits = self.model(**inputs).logits

        probabilities = torch.softmax(logits, dim=-1)[0]
        return float(probabilities[PHISHING_LABEL_INDEX].item())
