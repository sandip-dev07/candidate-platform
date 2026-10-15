"""Template + webhook + provider schemas."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, field_validator


class TemplateCreate(BaseModel):
    name: str
    body: str

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2:
            raise ValueError("Template name must be at least 2 characters.")
        return v

    @field_validator("body")
    @classmethod
    def _body(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Template body cannot be empty.")
        if len(v) > 2000:
            raise ValueError("Template body is too long (max 2000 chars).")
        return v


class TemplateUpdate(BaseModel):
    name: str | None = None
    body: str | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if len(v) < 2:
            raise ValueError("Template name must be at least 2 characters.")
        return v

    @field_validator("body")
    @classmethod
    def _body(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("Template body cannot be empty.")
        if len(v) > 2000:
            raise ValueError("Template body is too long (max 2000 chars).")
        return v


class TemplateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    body: str
    created_at: datetime
    updated_at: datetime


class TemplateSendRequest(BaseModel):
    candidate_id: uuid.UUID | None = None
    candidate_ids: list[uuid.UUID] | None = None
    variables: dict[str, str] | None = None


class WebhookIn(BaseModel):
    provider_message_id: str
    status: str
    error_code: str | None = None
    error_message: str | None = None
    raw: dict[str, Any] | None = None

    @field_validator("status")
    @classmethod
    def _status(cls, v: str) -> str:
        v = v.strip().lower()
        if v not in {"sent", "delivered", "read", "failed"}:
            raise ValueError("Status must be one of: sent, delivered, read, failed.")
        return v


class WebhookOut(BaseModel):
    message_id: uuid.UUID
    previous_status: str | None
    status: str
    duplicate: bool = False


class ProviderHealthOut(BaseModel):
    provider: str = "dummy"
    operational: bool
    messages_sent: int
    messages_delivered: int
    messages_failed: int
    messages_scheduled: int


class ProviderToggle(BaseModel):
    down: bool
