"""Templates: create, list, send via template (bonus: reusable templates)."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from configs.db import get_db
from models.candidate import Candidate
from models.message import MessageStatus
from models.template import MessageTemplate
from schemas.common import TemplateCreate, TemplateOut, TemplateSendRequest, TemplateUpdate
from schemas.message import BulkMessageResult, MessageOut
from services.messaging import bulk_item, render_template, send_to_candidate

router = APIRouter(prefix="/templates", tags=["templates"])


@router.post("", response_model=TemplateOut, status_code=201)
def create_template(payload: TemplateCreate, db: Session = Depends(get_db)):
    tpl = MessageTemplate(name=payload.name, body=payload.body)
    db.add(tpl)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="A template with this name already exists.")
    db.refresh(tpl)
    return tpl


@router.get("", response_model=list[TemplateOut])
def list_templates(db: Session = Depends(get_db)):
    return db.scalars(select(MessageTemplate).order_by(MessageTemplate.created_at.desc())).all()


@router.get("/{template_id}", response_model=TemplateOut)
def get_template(template_id: uuid.UUID, db: Session = Depends(get_db)):
    tpl = db.get(MessageTemplate, template_id)
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found.")
    return tpl


@router.patch("/{template_id}", response_model=TemplateOut)
def update_template(template_id: uuid.UUID, payload: TemplateUpdate, db: Session = Depends(get_db)):
    tpl = db.get(MessageTemplate, template_id)
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found.")
    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(status_code=400, detail="Provide name or body to update.")
    for k, v in data.items():
        setattr(tpl, k, v)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="A template with this name already exists.")
    db.refresh(tpl)
    return tpl


@router.delete("/{template_id}", status_code=204)
def delete_template(template_id: uuid.UUID, db: Session = Depends(get_db)):
    tpl = db.get(MessageTemplate, template_id)
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found.")
    db.delete(tpl)
    db.commit()
    return None


@router.post("/{template_id}/send", response_model=BulkMessageResult | MessageOut, status_code=201)
def send_with_template(template_id: uuid.UUID, payload: TemplateSendRequest, db: Session = Depends(get_db)):
    tpl = db.get(MessageTemplate, template_id)
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found.")
    ids: list[uuid.UUID] = []
    if payload.candidate_id:
        ids.append(payload.candidate_id)
    if payload.candidate_ids:
        ids.extend(payload.candidate_ids)
    if not ids:
        raise HTTPException(status_code=400, detail="Provide candidate_id or candidate_ids.")
    if len(ids) == 1:
        cand = db.get(Candidate, ids[0])
        if not cand:
            raise HTTPException(status_code=404, detail="Candidate not found.")
        return send_to_candidate(db, cand, render_template(tpl.body, cand, payload.variables))
    results = []
    sent = 0
    for cid in ids:
        cand = db.get(Candidate, cid)
        if not cand:
            results.append(bulk_item(cid, error_message="Candidate not found."))
            continue
        msg = send_to_candidate(db, cand, render_template(tpl.body, cand, payload.variables))
        results.append(bulk_item(cid, msg))
        if msg.status != MessageStatus.FAILED:
            sent += 1
    return {"total": len(ids), "sent": sent, "failed": len(ids) - sent, "results": results}
