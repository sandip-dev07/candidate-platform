"""Provider webhooks (status updates) — idempotent."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from configs.db import get_db
from schemas.common import WebhookIn, WebhookOut
from services.messaging import apply_webhook

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post("/provider", response_model=WebhookOut)
def provider_webhook(payload: WebhookIn, db: Session = Depends(get_db)):
    try:
        msg, duplicate = apply_webhook(
            db,
            provider_message_id=payload.provider_message_id,
            status=payload.status,
            error_code=payload.error_code,
            error_message=payload.error_message,
            raw=payload.raw or payload.model_dump(),
        )
    except LookupError:
        raise HTTPException(status_code=404, detail="Unknown message. Check the provider reference id.")
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    prev = msg.events[-1].from_status if msg.events else None
    return {"message_id": msg.id, "previous_status": prev, "status": msg.status.value, "duplicate": duplicate}
