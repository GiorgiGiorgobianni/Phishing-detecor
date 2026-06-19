"""Request/response data contracts for the analysis API.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class AnalyzeRequest(BaseModel):
    """ფეილოუდი რომელოც იგზავნება გაფართოებიდან"""

    email_body: str = Field(
        ...,
        description="Plain-text body of the email to analyze.",
        # ცარიელი მეილი აღიღმება როგორც უსაფრთხო, და არ არის უარყოფილი
        min_length=0,
        max_length=100_000,
    )
    sender_address: str = Field(
        default="",
        description="The sender's email address, used only for lightweight heuristics.",
        max_length=320,  # RFC 5321 maximum email address length
    )


class AnalyzeResponse(BaseModel):
    """სტრუქტურირებული დასკვნა"""

    phishing_probability: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Model probability that the email is phishing (0.0–1.0).",
    )
    status: str = Field(
        ...,
        description='One of: "flagged" (high risk), "suspicious" (medium), "safe" (low).',
    )
    reason: str = Field(
        ...,
        description="Short human-readable explanation for the verdict.",
    )


class HealthResponse(BaseModel):
    """კავშირის სტატუსი"""

    status: str
    model_loaded: bool
