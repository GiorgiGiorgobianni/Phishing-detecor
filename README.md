# AI ფიშინგ დეტექტორი


- **`/backend`** — FastAPI სერვისი, რომელზეც გაშვებულია ტექსტის კლასიფიკატორი(DistilBERT) და აბრუნებს ფიშინგის დასკვნას.
- **`/extension`** — Chrome Manifest V3 გაფართოება, რომელიც კითხულობს Gmail/Outlook-ში გახსნილ მეილს, ამუშავებს ბექენდში ვერდიქტის მისაღებად და გამოიტანს გამაფრთხილებელ ტექსტს, თუ მეილს საფრთხისშემცველად აღიქვამს.

```
phishing-detector/
├── backend/
│   ├── main.py            # FastAPI: POST /api/v1/analyze, GET /health
│   ├── model.py           # bert-finetuned-phishing
│   ├── schemas.py         # Pydantic request/response მოდელები
│   └── requirements.txt
└── extension/
    ├── manifest.json      # MV3 manifest
    ├── background.js       # სერვის ვორქერი - ბექენდთან დასაკავშირებლად
    ├── content.js          # ადეტექტებს მეილს, უგზავნის ტექსტს ბექენდს და გამოაქვს ვერდიქტი
    ├── styles.css          # ბანერის(გამაფრთხილებელი ტექსტის) დიზაინი
    ├── popup.html
    |__ popup.js
    └── icons/
```

## 1. ბექენდის გაშვება

ვერსია Python 3.10+.

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python main.py            # ან : uvicorn main:app --port 8000
```



- `POST http://localhost:8000/api/v1/analyze`
- `GET  http://localhost:8000/health`


გატესტვა:

```bash
curl -X POST http://localhost:8000/api/v1/analyze \
  -H "Content-Type: application/json" \
  -d '{"email_body":"Urgent: your account is suspended. Verify your identity immediately by clicking here.","sender_address":"security@example.com"}'
```

## 2. Load the extension

1. გახსენით `chrome://extensions`.
2. ჩართეთ **Developer mode** (ზედა მარჯვენა კუთხეში).
3. აირჩიეთ **Load unpacked** და შემდეგ `extension/` ფოლდერი.
4. შედით Gmail ან Outlook ვებ-გვერდზე და გახსენით რომელიმე მეილი. თუ საეჭვოდ აღიქვამს დეტექტორი, მაშინ შიგთავსის ზევით გამოვა ბანერი.
არ დაგავიწყდეთ გამოყენებამდე გაფართოების ჩართვა.

## როგორ მუშაობს


ბექენდში არსებული POST მოთხოვნის ჰენდლერი არის ასინქრონული; CPU-bound მოდელის forward pass მუშავდება ცალკე ვორქერ thread-ში(run_in_threadpool), რათა ივენთ ლუფმა იმუშაოს და latency შეძლებისდაგვარად დაბალი შეინარჩუნოს.


## კონფიდენციალურობა

მეილის შიგთავსი და გამომგზავნის მისამართები მუშავდება მეხსიერებაში და არ იწერება დისკზე. ბექენდში ილოგება მხოლოდ არაიდენტიფიცირებადი მეტადატა(ზომა, ალბათობა, სტატუსი)

