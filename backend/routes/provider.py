"""Dummy provider health + outage simulation (bonus: provider health)."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from configs.db import get_db
from providers.dummy_provider import provider
from schemas.common import ProviderHealthOut, ProviderToggle
from services.messaging import provider_counts

router = APIRouter(prefix="/provider", tags=["provider"])


@router.get("/health", response_model=ProviderHealthOut)
def provider_health(db: Session = Depends(get_db)):
    counts = provider_counts(db)
    return {
        "provider": provider.name,
        "operational": not provider.is_down,
        "messages_sent": counts.get("sent", 0) + counts.get("delivered", 0) + counts.get("read", 0),
        "messages_delivered": counts.get("delivered", 0) + counts.get("read", 0),
        "messages_failed": counts.get("failed", 0),
        "messages_scheduled": counts.get("scheduled", 0),
    }


@router.post("/simulate-down", response_model=ProviderHealthOut)
def simulate_down(payload: ProviderToggle, db: Session = Depends(get_db)):
    provider.set_down(payload.down)
    return provider_health(db)
