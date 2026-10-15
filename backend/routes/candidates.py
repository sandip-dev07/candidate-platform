"""Candidate CRUD + search + history."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from configs.db import get_db
from models.candidate import Candidate
from models.message import Message
from schemas.candidate import CandidateCreate, CandidateList, CandidateOut, CandidateUpdate
from schemas.message import MessageList, MessageOut

router = APIRouter(prefix="/candidates", tags=["candidates"])


def _conflict_detail(exc: Exception) -> str:
    msg = str(exc.orig) if hasattr(exc, "orig") else str(exc)
    if "phone" in msg.lower():
        return "This phone number is already registered to another candidate."
    if "email" in msg.lower():
        return "This email address is already registered to another candidate."
    return "Candidate with these details already exists."


@router.post("", response_model=CandidateOut, status_code=201)
def create_candidate(payload: CandidateCreate, db: Session = Depends(get_db)):
    cand = Candidate(name=payload.name, phone=payload.phone, email=payload.email)
    db.add(cand)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=_conflict_detail(exc))
    db.refresh(cand)
    return cand


@router.get("", response_model=CandidateList)
def list_candidates(
    search: str | None = Query(default=None, description="Search name, phone, email"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    stmt = select(Candidate)
    count_stmt = select(func.count()).select_from(Candidate)
    if search:
        like = f"%{search.strip()}%"
        filt = or_(
            Candidate.name.ilike(like),
            Candidate.phone.ilike(like),
            Candidate.email.ilike(like),
        )
        stmt = stmt.where(filt)
        count_stmt = count_stmt.where(filt)
    total = db.scalar(count_stmt) or 0
    items = db.scalars(stmt.order_by(Candidate.created_at.desc()).offset(offset).limit(limit)).all()
    return {"items": items, "total": total}


@router.get("/{candidate_id}", response_model=CandidateOut)
def get_candidate(candidate_id: uuid.UUID, db: Session = Depends(get_db)):
    cand = db.get(Candidate, candidate_id)
    if not cand:
        raise HTTPException(status_code=404, detail="Candidate not found.")
    return cand


@router.patch("/{candidate_id}", response_model=CandidateOut)
def update_candidate(candidate_id: uuid.UUID, payload: CandidateUpdate, db: Session = Depends(get_db)):
    cand = db.get(Candidate, candidate_id)
    if not cand:
        raise HTTPException(status_code=404, detail="Candidate not found.")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(cand, k, v)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=_conflict_detail(exc))
    db.refresh(cand)
    return cand


@router.delete("/{candidate_id}", status_code=204)
def delete_candidate(candidate_id: uuid.UUID, db: Session = Depends(get_db)):
    cand = db.get(Candidate, candidate_id)
    if not cand:
        raise HTTPException(status_code=404, detail="Candidate not found.")
    db.delete(cand)
    db.commit()
    return None


@router.get("/{candidate_id}/messages", response_model=MessageList)
def candidate_history(
    candidate_id: uuid.UUID,
    status: str | None = Query(default=None, description="Filter: sent, delivered, read, failed, scheduled"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    cand = db.get(Candidate, candidate_id)
    if not cand:
        raise HTTPException(status_code=404, detail="Candidate not found.")
    stmt = select(Message).where(Message.candidate_id == candidate_id)
    count_stmt = select(func.count()).select_from(Message).where(Message.candidate_id == candidate_id)
    if status:
        stmt = stmt.where(Message.status == status)
        count_stmt = count_stmt.where(Message.status == status)
    total = db.scalar(count_stmt) or 0
    items = db.scalars(stmt.order_by(Message.created_at.desc()).offset(offset).limit(limit)).all()
    return {"items": items, "total": total}
