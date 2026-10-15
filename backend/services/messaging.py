"""Messaging service: send / bulk / webhook / retry / scheduled."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from models.candidate import Candidate
from models.message import Message, MessageStatus, MessageStatusEvent
from models.template import MessageTemplate
from providers.dummy_provider import ProviderError, provider

ORDER = {
    MessageStatus.SENT: 1,
    MessageStatus.DELIVERED: 2,
    MessageStatus.READ: 3,
}
TERMINAL_READ_ONLY = {MessageStatus.READ, MessageStatus.FAILED}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def render_template(body: str, candidate: Candidate, variables: dict[str, str] | None) -> str:
    out = body.replace("{{name}}", candidate.name).replace("{{phone}}", candidate.phone)
    for k, v in (variables or {}).items():
        out = out.replace("{{" + k + "}}", v)
    return out


def resolve_body(
    db: Session,
    candidate: Candidate,
    body: str | None,
    template_id: uuid.UUID | None,
    variables: dict[str, str] | None,
) -> str:
    if template_id:
        tpl = db.get(MessageTemplate, template_id)
        if not tpl:
            raise ValueError("Template not found.")
        return render_template(tpl.body, candidate, variables)
    if not body or not body.strip():
        raise ValueError("Provide either body or template_id.")
    # allow {{name}} in ad-hoc bodies too
    return render_template(body, candidate, variables)


def _record_event(
    db: Session,
    message: Message,
    from_status: str | None,
    to_status: str,
    raw: dict | None = None,
) -> None:
    db.add(
        MessageStatusEvent(
            message_id=message.id,
            from_status=from_status,
            to_status=to_status,
            raw_payload=raw,
        )
    )


def bulk_item(
    candidate_id: uuid.UUID,
    message: Message | None = None,
    error_code: str | None = None,
    error_message: str | None = None,
) -> dict:
    """One per-candidate entry for bulk results. Never raises."""
    if message is None:
        return {
            "candidate_id": candidate_id,
            "message_id": None,
            "status": MessageStatus.FAILED.value,
            "provider_message_id": None,
            "error_code": error_code or "CANDIDATE_NOT_FOUND",
            "error_message": error_message or "Candidate not found.",
        }
    failed = message.status == MessageStatus.FAILED
    return {
        "candidate_id": candidate_id,
        "message_id": message.id,
        "status": message.status.value,
        "provider_message_id": message.provider_message_id,
        "error_code": message.error_code if failed else None,
        "error_message": message.error_message if failed else None,
    }


def send_to_candidate(
    db: Session,
    candidate: Candidate,
    body: str,
    scheduled_for: datetime | None = None,
) -> Message:
    """Create + send a single message. Scheduled future messages are stored, not sent."""
    if scheduled_for and scheduled_for > _now():
        msg = Message(
            candidate_id=candidate.id,
            body=body,
            provider=provider.name,
            status=MessageStatus.SCHEDULED,
            scheduled_for=scheduled_for,
            attempt_count=0,
        )
        db.add(msg)
        db.flush()
        _record_event(db, msg, None, MessageStatus.SCHEDULED.value)
        db.commit()
        db.refresh(msg)
        return msg

    msg = Message(
        candidate_id=candidate.id,
        body=body,
        provider=provider.name,
        attempt_count=1,
    )
    db.add(msg)
    db.flush()
    try:
        pm_id = provider.send(candidate.phone, body)
    except ProviderError as exc:
        msg.status = MessageStatus.FAILED
        msg.error_code = exc.code
        msg.error_message = exc.message
        msg.retryable = exc.retryable
        _record_event(db, msg, None, MessageStatus.FAILED.value, {"error_code": exc.code})
        db.commit()
        db.refresh(msg)
        return msg

    msg.provider_message_id = pm_id
    msg.status = MessageStatus.SENT
    msg.sent_at = _now()
    _record_event(db, msg, None, MessageStatus.SENT.value, {"provider_message_id": pm_id})
    db.commit()
    db.refresh(msg)
    return msg


def apply_webhook(
    db: Session,
    provider_message_id: str,
    status: str,
    error_code: str | None = None,
    error_message: str | None = None,
    raw: dict | None = None,
) -> tuple[Message, bool]:
    """Apply provider status update. Idempotent: same status twice -> duplicate=True."""
    msg = db.scalars(
        select(Message).where(Message.provider_message_id == provider_message_id)
    ).one_or_none()
    if not msg:
        raise LookupError("Unknown provider message id.")

    target = MessageStatus(status.lower())
    if msg.status == target:
        return msg, True  # idempotent replay
    if msg.status == MessageStatus.SCHEDULED:
        raise ValueError("Scheduled messages cannot receive provider updates yet.")
    if msg.status in TERMINAL_READ_ONLY and target != MessageStatus.FAILED:
        if ORDER.get(target, 0) < ORDER.get(msg.status, 0):
            raise ValueError(f"Cannot move message from {msg.status.value} back to {target.value}.")

    prev = msg.status.value
    now = _now()
    if target == MessageStatus.SENT:
        msg.status = target
        msg.sent_at = msg.sent_at or now
    elif target == MessageStatus.DELIVERED:
        if msg.status not in (MessageStatus.SENT, MessageStatus.DELIVERED):
            raise ValueError(f"Cannot move message from {msg.status.value} to delivered.")
        msg.status = target
        msg.delivered_at = now
    elif target == MessageStatus.READ:
        if msg.status not in (MessageStatus.SENT, MessageStatus.DELIVERED, MessageStatus.READ):
            raise ValueError(f"Cannot move message from {msg.status.value} to read.")
        msg.status = target
        msg.delivered_at = msg.delivered_at or now
        msg.read_at = now
    elif target == MessageStatus.FAILED:
        msg.status = target
        msg.error_code = error_code or "DELIVERY_FAILED"
        msg.error_message = error_message or "The provider reported a delivery failure."
        msg.retryable = True if (error_code in {"TEMPORARY_FAILURE", "RATE_LIMITED", "PROVIDER_UNAVAILABLE"}) else msg.retryable

    _record_event(db, msg, prev, target.value, raw)
    db.commit()
    db.refresh(msg)
    return msg, False


def retry_message(db: Session, message: Message) -> Message:
    if message.status != MessageStatus.FAILED:
        raise ValueError(f"Only failed messages can be retried (current: {message.status.value}).")
    if not message.retryable:
        raise ValueError(
            f"This failure ({message.error_code or 'permanent'}) cannot be retried. "
            "Fix the recipient or content and send a new message."
        )
    message.attempt_count += 1
    try:
        pm_id = provider.send(message.candidate.phone, message.body)
    except ProviderError as exc:
        message.error_code = exc.code
        message.error_message = exc.message
        message.retryable = exc.retryable
        _record_event(db, message, MessageStatus.FAILED.value, MessageStatus.FAILED.value, {"retry": True, "error_code": exc.code})
        db.commit()
        db.refresh(message)
        return message

    prev = message.status.value
    message.provider_message_id = pm_id
    message.status = MessageStatus.SENT
    message.error_code = None
    message.error_message = None
    message.retryable = False
    message.sent_at = _now()
    _record_event(db, message, prev, MessageStatus.SENT.value, {"retry": True, "provider_message_id": pm_id})
    db.commit()
    db.refresh(message)
    return message


def process_due_scheduled(db: Session, limit: int = 50) -> list[Message]:
    now = _now()
    due = db.scalars(
        select(Message)
        .where(Message.status == MessageStatus.SCHEDULED)
        .where(Message.scheduled_for.is_not(None))
        .where(Message.scheduled_for <= now)
        .order_by(Message.scheduled_for)
        .limit(limit)
    ).all()
    sent: list[Message] = []
    for msg in due:
        msg.attempt_count = (msg.attempt_count or 0) + 1
        try:
            pm_id = provider.send(msg.candidate.phone, msg.body)
        except ProviderError as exc:
            msg.status = MessageStatus.FAILED
            msg.error_code = exc.code
            msg.error_message = exc.message
            msg.retryable = exc.retryable
            _record_event(db, msg, MessageStatus.SCHEDULED.value, MessageStatus.FAILED.value)
            continue
        msg.provider_message_id = pm_id
        msg.status = MessageStatus.SENT
        msg.sent_at = now
        _record_event(db, msg, MessageStatus.SCHEDULED.value, MessageStatus.SENT.value)
        sent.append(msg)
    db.commit()
    for m in sent:
        db.refresh(m)
    return sent


def provider_counts(db: Session) -> dict[str, int]:
    rows = db.execute(
        select(Message.status, func.count()).group_by(Message.status)
    ).all()
    counts = {s.value: 0 for s in MessageStatus}
    for status, n in rows:
        counts[status.value if isinstance(status, MessageStatus) else status] = n
    return counts
