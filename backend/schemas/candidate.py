"""Candidate schemas."""
from __future__ import annotations

import re
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, field_validator

PHONE_RE = re.compile(r"^\+?[0-9\s\-()]{7,20}$")


class CandidateCreate(BaseModel):
    name: str
    phone: str
    email: EmailStr

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2:
            raise ValueError("Name must be at least 2 characters.")
        return v

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        v = v.strip()
        if not PHONE_RE.match(v):
            raise ValueError("Phone number looks invalid. Use digits with optional leading +, 7-20 chars.")
        return v


class CandidateUpdate(BaseModel):
    name: str | None = None
    phone: str | None = None
    email: EmailStr | None = None

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not PHONE_RE.match(v):
            raise ValueError("Phone number looks invalid. Use digits with optional leading +, 7-20 chars.")
        return v


class CandidateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    phone: str
    email: str
    created_at: datetime
    updated_at: datetime


class CandidateList(BaseModel):
    items: list[CandidateOut]
    total: int
