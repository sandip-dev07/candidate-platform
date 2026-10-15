"""Message schemas."""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator


class MessageCreate(BaseModel):
    candidate_id: uuid.UUID
    body: str | None = None
    template_id: uuid.UUID | None = None
    variables: dict[str, str] | None = None
    scheduled_for: datetime | None = None

    @field_validator("body")
    @classmethod
    def _body(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("Message body cannot be empty.")
        if len(v) > 2000:
            raise ValueError("Message body is too long (max 2000 chars).")
        return v


class BulkMessageCreate(BaseModel):
    candidate_ids: list[uuid.UUID]
    body: str | None = None
    template_id: uuid.UUID | None = None
    variables: dict[str, str] | None = None

    @field_validator("candidate_ids")
    @classmethod
    def _ids(cls, v: list[uuid.UUID]) -> list[uuid.UUID]:
        if not v:
            raise ValueError("Select at least one candidate.")
        if len(v) > 100:
            raise ValueError("Bulk send supports up to 100 candidates at once.")
        return v

    @field_validator("body")
    @classmethod
    def _body(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("Message body cannot be empty.")
        if len(v) > 2000:
            raise ValueError("Message body is too long (max 2000 chars).")
        return v


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    candidate_id: uuid.UUID
    body: str
    provider: str
    provider_message_id: str | None
    status: str
    error_code: str | None
    error_message: str | None
    retryable: bool
    attempt_count: int
    scheduled_for: datetime | None
    sent_at: datetime | None
    delivered_at: datetime | None
    read_at: datetime | None
    created_at: datetime
    updated_at: datetime


class BulkItemResult(BaseModel):
    candidate_id: uuid.UUID
    message_id: uuid.UUID | None = None
    status: str
    provider_message_id: str | None = None
    error_code: str | None = None
    error_message: str | None = None


class BulkMessageResult(BaseModel):
    total: int
    sent: int
    failed: int
    results: list[BulkItemResult]


class MessageList(BaseModel):
    items: list[MessageOut]
    total: int
