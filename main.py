"""რეალურ დროში მომუშავე ფიშინგ ანალიზის API.

FastAPI სერვისი, რომელიც ახდენს მეილის ტექსტის კლასიფიცირებას მოდელის საშუალებით
და აგენერირებს მომხმარებლისთვის მარტივად გასაგებ დასკვნას. იჰოსტება ლოკალჰოსტზე და
მუშაობს გუგლ ბრაუზერის გაფართოების სახით.

კონფიდენციალურობის შესახებ:
    მეილის შიგთავსი და გამომგზავნის/ადრესატის მისამართები მუშავდება კომპიუტერის მეხსიერებაში
    და არ იწერება დისკზე ან ლოგებში.
"""

from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware

from model import PhishingClassifier
from schemas import AnalyzeRequest, AnalyzeResponse, HealthResponse

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
)
logger = logging.getLogger("analysis-api")

# რისკის დონეები.
HIGH_RISK_THRESHOLD = 0.80
SUSPICIOUS_THRESHOLD = 0.50


# საკვზნძო ტერმინები და ფრაზები, რომელიც ეხმარება მოდელს ფიშინგის ალბათობის დეტექციაში.
_URGENCY_TERMS = (
    "urgent", "immediately", "act now", "right away", "as soon as possible",
    "verify your account", "confirm your identity", "update your password",
    "account suspended", "account locked", "unusual activity", "unauthorized",
    "click here", "click the link", "limited time", "expires", "final notice",
    "wire transfer", "gift card", "bitcoin", "payment failed", "invoice attached",
)


classifier: PhishingClassifier | None = None


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Load the (relatively heavy) model once at startup, not per request."""
    global classifier
    logger.info("Starting up: loading classification model ...")
    classifier = PhishingClassifier()
    logger.info("Startup complete: model loaded and serving.")
    yield
    logger.info("Shutting down.")


app = FastAPI(
    title="Real-Time Phishing Analysis API",
    description="Classifies email text and returns a phishing-risk verdict.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)


def classify_status(probability: float) -> str:
    """Bucket a probability into a coarse status the UI can act on."""
    if probability >= HIGH_RISK_THRESHOLD:
        return "flagged"
    if probability >= SUSPICIOUS_THRESHOLD:
        return "suspicious"
    return "safe"


def derive_reason(text: str, probability: float) -> str:
    """მოკლე აღწერა, თუ რატომ დაფლეგა მეილის შინაარსი პროგრამამ.

    ჯერ-ჯერობით მუშაობს შედარებით მარტივ და ხშირად განმეორებად ფრაზებზე, რომლებიც სოციალურ ინჟინერიაში გამოიყენება.
    """
    lowered = text.lower()
    hits = [term for term in _URGENCY_TERMS if term in lowered]

    if probability >= HIGH_RISK_THRESHOLD:
        if hits:
            preview = ", ".join(hits[:3])
            return f"High-risk language detected (e.g. {preview})."
        return "Model detected strong phishing signals in the message text."
    if probability >= SUSPICIOUS_THRESHOLD:
        if hits:
            return "Some suspicious phrasing detected; treat links with caution."
        return "Mildly suspicious patterns detected."
    return "No strong phishing indicators found."


@app.post("/api/v1/analyze", response_model=AnalyzeResponse)
async def analyze(payload: AnalyzeRequest) -> AnalyzeResponse:
    """აანალიზებს და აბრუნებს ფიშინგის რისკის დასკვნას.

    მუშაობს ასინქრონულად, CPU-bound მოდელის forward pass ეგზავნება ვორქერს 'run_in_threadpool'-ის მეშვეობით,
    რაც ივენთ ლუფს აძლევს სხვა კავშირების მიღების უფლებას და კონკურენტული დატვირთვის შემდეგ მაინც ინარჩუნებს low-latency-ს.
    """
    started = time.perf_counter()

    if classifier is None:
        return AnalyzeResponse(
            phishing_probability=0.0,
            status="safe",
            reason="Analyzer is still warming up; please retry shortly.",
        )

    text = payload.email_body or ""

    probability = await run_in_threadpool(classifier.predict, text)

    status = classify_status(probability)
    reason = derive_reason(text, probability)

    elapsed_ms = (time.perf_counter() - started) * 1000.0
    # PII-safe logging: log only metadata, never the email body or sender address.
    logger.info(
        "analyze: prob=%.3f status=%s body_chars=%d latency_ms=%.1f",
        probability, status, len(text), elapsed_ms,
    )

    return AnalyzeResponse(
        phishing_probability=round(probability, 4),
        status=status,
        reason=reason,
    )


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """ბექენდის სტატუსის გამოტანა გაფართოების ფანჯარაში."""
    return HealthResponse(status="ok", model_loaded=classifier is not None)


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
