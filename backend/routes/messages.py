"""Message send / bulk / retry / detail / scheduled."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from configs.db import get_db
from models.candidate import Candidate
from models.message import Message, MessageStatus
from providers.dummy_provider import ProviderError, provider
from schemas.message import BulkMessageCreate, BulkMessageResult, MessageCreate, MessageOut
from services.messaging import (
    bulk_item,
    process_due_scheduled,
    resolve_body,
    retry_message,
    send_to_candidate,
)

router = APIRouter(prefix="/messages", tags=["messages"])


@router.post("", response_model=MessageOut, status_code=201)
def send_message(payload: MessageCreate, db: Session = Depends(get_db)):
    cand = db.get(Candidate, payload.candidate_id)
    if not cand:
        raise HTTPException(status_code=404, detail="Candidate not found. Select a valid candidate.")
    try:
        body = resolve_body(db, cand, payload.body, payload.template_id, payload.variables)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return send_to_candidate(db, cand, body, payload.scheduled_for)


@router.post("/bulk", response_model=BulkMessageResult, status_code=201)
def send_bulk(payload: BulkMessageCreate, db: Session = Depends(get_db)):
    """Send the same message to many candidates. Each is tracked independently."""
    results = []
    sent = 0
    for cid in payload.candidate_ids:
        cand = db.get(Candidate, cid)
        if not cand:
            results.append(bulk_item(cid, error_message="Candidate not found. Others were still processed."))
            continue
        try:
            body = resolve_body(db, cand, payload.body, payload.template_id, payload.variables)
        except ValueError as exc:
            results.append(bulk_item(cid, error_code="INVALID_BODY", error_message=str(exc)))
            continue
        try:
            msg = send_to_candidate(db, cand, body)
        except Exception:
            db.rollback()
            results.append(bulk_item(cid, error_code="INTERNAL_ERROR", error_message="Could not process this message. Others were still processed."))
            continue
        results.append(bulk_item(cid, msg))
        if msg.status != MessageStatus.FAILED:
            sent += 1
    return {"total": len(payload.candidate_ids), "sent": sent, "failed": len(payload.candidate_ids) - sent, "results": results}


@router.get("/{message_id}", response_model=MessageOut)
def get_message(message_id: uuid.UUID, db: Session = Depends(get_db)):
    msg = db.get(Message, message_id)
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found.")
    return msg


@router.post("/{message_id}/retry", response_model=MessageOut)
def retry_failed(message_id: uuid.UUID, db: Session = Depends(get_db)):
    msg = db.get(Message, message_id)
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found.")
    if provider.is_down:
        raise HTTPException(
            status_code=503,
            detail="Communication service is unavailable. Retry will be possible once it recovers.",
        )
    try:
        return retry_message(db, msg)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/{message_id}/send-now", response_model=MessageOut)
def send_scheduled_now(message_id: uuid.UUID, db: Session = Depends(get_db)):
    msg = db.get(Message, message_id)
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found.")
    if msg.status != MessageStatus.SCHEDULED:
        raise HTTPException(status_code=400, detail=f"Only scheduled messages can be sent now (current: {msg.status.value}).")
    msg.scheduled_for = None
    msg.attempt_count = (msg.attempt_count or 0) + 1
    try:
        msg.provider_message_id = provider.send(msg.candidate.phone, msg.body)
    except ProviderError as exc:
        msg.status = MessageStatus.FAILED
        msg.error_code = exc.code
        msg.error_message = exc.message
        msg.retryable = exc.retryable
        db.commit()
        db.refresh(msg)
        return msg
    msg.status = MessageStatus.SENT
    msg.sent_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(msg)
    return msg


@router.post("/process-due", response_model=list[MessageOut])
def process_due(db: Session = Depends(get_db)):
    return process_due_scheduled(db)
