"""Dummy communication provider (separate from main app logic).

Deterministic simulation rules (documented for recruiters/tests):
- Provider DOWN flag -> ProviderUnavailable (retryable)
- body contains "[unavailable]" or phone endswith "0001" -> unavailable
- body contains "[ratelimit]" or phone endswith "0002" -> rate limited (retryable)
- body contains "[temp]" or phone endswith "9999" -> temporary failure (retryable)
- body contains "[fail]" or phone endswith "0000" -> delivery failure (permanent)
- phone starting with "+000" or containing "invalid" -> invalid recipient (permanent)
- otherwise -> success, returns provider message id, initial status "sent"
"""
from __future__ import annotations

import uuid


class ProviderError(Exception):
    code: str = "PROVIDER_ERROR"
    retryable: bool = False
    status_code: int = 502

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class InvalidRecipientError(ProviderError):
    code = "INVALID_RECIPIENT"
    retryable = False
    status_code = 400


class TemporaryFailureError(ProviderError):
    code = "TEMPORARY_FAILURE"
    retryable = True
    status_code = 502


class RateLimitedError(ProviderError):
    code = "RATE_LIMITED"
    retryable = True
    status_code = 429


class DeliveryFailedError(ProviderError):
    code = "DELIVERY_FAILED"
    retryable = False
    status_code = 502


class ProviderUnavailableError(ProviderError):
    code = "PROVIDER_UNAVAILABLE"
    retryable = True
    status_code = 503


class DummyProvider:
    name = "dummy"

    def __init__(self):
        self._down = False

    # -- controls (for demo / tests) --
    def set_down(self, down: bool) -> None:
        self._down = down

    @property
    def is_down(self) -> bool:
        return self._down

    # -- core API --
    def send(self, to_phone: str, body: str) -> str:
        phone = (to_phone or "").strip()
        text = (body or "").strip()
        lowered = text.lower()

        if self._down or "[unavailable]" in lowered or phone.endswith("0001"):
            raise ProviderUnavailableError(
                "Communication service is temporarily unavailable. Please try again shortly."
            )
        if not phone or "invalid" in phone.lower() or phone.startswith("+000"):
            raise InvalidRecipientError(
                "This phone number looks invalid. Please check the candidate's phone number."
            )
        if "[ratelimit]" in lowered or phone.endswith("0002"):
            raise RateLimitedError(
                "Too many messages right now. Please wait a moment and retry."
            )
        if "[temp]" in lowered or phone.endswith("9999"):
            raise TemporaryFailureError(
                "Temporary provider failure. It is safe to retry this message."
            )
        if "[fail]" in lowered or phone.endswith("0000"):
            raise DeliveryFailedError(
                "The provider could not deliver this message. Check the number and try again."
            )
        if not text:
            raise InvalidRecipientError("Message body is empty.")

        return f"dummy_{uuid.uuid4().hex[:12]}"


provider = DummyProvider()
