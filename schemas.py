"""Request/response data contracts for the analysis API.

These Pydantic models define and validate the JSON payloads exchanged with the
browser extension. Keeping them in one place makes the API contract explicit and
gives us automatic validation + OpenAPI docs for free.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class AnalyzeRequest(BaseModel):
    """Payload sent by the extension for a single email."""

    email_body: str = Field(
        ...,
        description="Plain-text body of the email to analyze.",
        # An empty body is tolerated and treated as low risk rather than rejected,
        # so a flaky DOM scrape never breaks the user's inbox.
        min_length=0,
        max_length=100_000,
    )
    sender_address: str = Field(
        default="",
        description="The sender's email address, used only for lightweight heuristics.",
        max_length=320,  # RFC 5321 maximum email address length
    )


class AnalyzeResponse(BaseModel):
    """Structured verdict returned to the extension."""

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
    """Lightweight health/readiness signal used by the extension popup."""

    status: str
    model_loaded: bool
