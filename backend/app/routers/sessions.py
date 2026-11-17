"""Sessions and readings, including the attention-debt lifecycle:

watch session --end--> missed_segments + debt computed on the server
review session (Second Pass, review_of=<watch id>) --end--> segments of the original closed
"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pymongo import ReturnDocument

from ..db import get_db
from ..schemas import (ReadingIn, ReadingOut, SessionDetailOut, SessionEndOut,
                       SessionIn, SessionOut, SessionSummary)
from ..security import CurrentUser, get_current_user
from ..services import segments as seg
from ..utils import not_found, parse_oid

router = APIRouter(prefix="/api/sessions", tags=["sessions"])

MODEL_VERSION = "v4_7"
STALE_AFTER = timedelta(hours=2)  # open session with no reading for 2h is closed lazily


def _avg(s: dict) -> float | None:
    n = s.get("reading_count", 0)
    return round(s.get("score_sum", 0.0) / n, 4) if n else None


def summary_dict(s: dict) -> dict:
    return {
        "id": str(s["_id"]),
        "content_id": str(s["content_id"]),
        "content_title": s.get("content_title", ""),
        "content_type": s.get("content_type", ""),
        "mode": s.get("mode", "watch"),
        "started_at": s["started_at"],
        "ended_at": s.get("ended_at"),
        "reading_count": s.get("reading_count", 0),
        "average_score": _avg(s),
        "debt_seconds": s.get("debt_seconds", 0.0),
        "debt_unit": s.get("debt_unit", "seconds"),
    }


def end_dict(s: dict) -> dict:
    d = summary_dict(s)
    d["missed_segments"] = s.get("missed_segments", [])
    d["review_of"] = str(s["review_of"]) if s.get("review_of") else None
    d["review_segments"] = s.get("review_segments", [])
    for k in ("segments_closed", "segments_total", "debt_remaining"):
        d[k] = s.get(k)
    return d


async def _own_session(session_id: str, user: CurrentUser) -> dict:
    s = await get_db().sessions.find_one({"_id": parse_oid(session_id), "owner_id": user.id})
    if s is None:
        not_found()
    return s


async def finalize(s: dict, ended_at: datetime | None = None) -> dict:
    """Close a session and compute debt. Idempotent: an ended session is returned as is."""
    if s.get("ended_at"):
        return s
    db = get_db()
    readings = await db.readings.find({"session_id": s["_id"]}).sort("created_at", 1).to_list(None)
    unit = s.get("debt_unit", "seconds")
    upd: dict = {"ended_at": ended_at or datetime.now(timezone.utc)}

    if s.get("mode") == "review":
        upd["missed_segments"] = []      # review readings never create new debt
        upd["debt_seconds"] = 0.0
        orig = await db.sessions.find_one({"_id": s["review_of"], "owner_id": s["owner_id"]})
        if orig is not None:
            orig_segs = orig.get("missed_segments", [])
            open_before = sum(1 for x in orig_segs if not x.get("closed"))
            new_segs, closed = seg.close_segments(
                orig_segs, readings, s.get("watched_idx", []), unit, closed_by=str(s["_id"]))
            remaining = seg.total_debt(new_segs, unit)
            await db.sessions.update_one(
                {"_id": orig["_id"], "owner_id": s["owner_id"]},
                {"$set": {"missed_segments": new_segs, "debt_seconds": remaining}})
            upd.update(segments_closed=closed, segments_total=open_before, debt_remaining=remaining)
    else:
        segments = seg.compute_missed_segments(readings, unit)
        upd["missed_segments"] = segments
        upd["debt_seconds"] = seg.total_debt(segments, unit)

    done = await db.sessions.find_one_and_update(
        {"_id": s["_id"], "ended_at": None}, {"$set": upd}, return_document=ReturnDocument.AFTER)
    return done or await db.sessions.find_one({"_id": s["_id"]})


async def close_stale_sessions(owner_id) -> None:
    """Lazy close: sessions left open (tab closed, crash) whose last activity is >2h old."""
    db = get_db()
    cutoff = datetime.now(timezone.utc) - STALE_AFTER
    stale = db.sessions.find({
        "owner_id": owner_id, "ended_at": None,
        "$or": [{"last_reading_at": {"$lt": cutoff}},
                {"last_reading_at": None, "started_at": {"$lt": cutoff}}],
    })
    async for s in stale:
        await finalize(s, ended_at=s.get("last_reading_at") or s["started_at"])


@router.post("", status_code=status.HTTP_201_CREATED, response_model=SessionOut)
async def create_session(body: SessionIn, user: CurrentUser = Depends(get_current_user)):
    db = get_db()
    content = await db.content.find_one({"_id": parse_oid(body.content_id), "owner_id": user.id})
    if content is None:
        not_found()

    unit = seg.unit_for(content["type"])
    doc = {
        "owner_id": user.id,
        "content_id": content["_id"],
        "content_title": content["title"],
        "content_type": content["type"],
        "started_at": datetime.now(timezone.utc),
        "ended_at": None,
        "last_reading_at": None,
        "model_version": MODEL_VERSION,
        "reading_count": 0,
        "score_sum": 0.0,
        "mode": body.mode,
        "review_of": None,
        "review_segments": [],
        "watched_idx": [],
        "missed_segments": [],
        "debt_seconds": 0.0,
        "debt_unit": unit,
    }

    if body.mode == "review":
        if not body.review_of:
            raise HTTPException(status_code=422, detail="למעבר שני צריך לבחור סשן מקורי")
        orig = await db.sessions.find_one({
            "_id": parse_oid(body.review_of), "owner_id": user.id,
            "content_id": content["_id"], "mode": "watch",
        })
        if orig is None:
            not_found()
        targets = [{"idx": i, "start": x["start"], "end": x["end"]}
                   for i, x in enumerate(orig.get("missed_segments", [])) if not x.get("closed")]
        if not orig.get("ended_at") or not targets:
            raise HTTPException(status_code=422, detail="אין בסשן הזה קטעים פתוחים למעבר שני")
        doc["review_of"] = orig["_id"]
        doc["review_segments"] = targets

    res = await db.sessions.insert_one(doc)
    return SessionOut(id=str(res.inserted_id), content_id=str(content["_id"]), mode=body.mode,
                      started_at=doc["started_at"],
                      review_of=str(doc["review_of"]) if doc["review_of"] else None,
                      review_segments=doc["review_segments"])


@router.post("/{session_id}/readings", status_code=status.HTTP_201_CREATED,
             response_model=ReadingOut)
async def add_reading(session_id: str, body: ReadingIn,
                      user: CurrentUser = Depends(get_current_user)):
    db = get_db()
    s = await _own_session(session_id, user)
    if s.get("ended_at"):
        raise HTTPException(status_code=409, detail="הסשן כבר הסתיים")

    now = datetime.now(timezone.utc)
    doc = {
        "session_id": s["_id"], "owner_id": user.id,
        "position": body.position, "score": body.score,
        "smoothed": body.smoothed, "level": body.level,
        "attention_peak": body.attention_peak, "created_at": now,
    }
    res = await db.readings.insert_one(doc)
    upd = await db.sessions.update_one(
        {"_id": s["_id"], "ended_at": None},
        {"$inc": {"reading_count": 1, "score_sum": body.score}, "$set": {"last_reading_at": now}})
    if upd.matched_count == 0:  # session ended between the check and the insert
        await db.readings.delete_one({"_id": res.inserted_id})
        raise HTTPException(status_code=409, detail="הסשן כבר הסתיים")
    return ReadingOut(position=body.position, score=body.score, created_at=now)


@router.post("/{session_id}/end", response_model=SessionEndOut)
async def end_session(session_id: str, user: CurrentUser = Depends(get_current_user)):
    s = await _own_session(session_id, user)
    return end_dict(await finalize(s))


@router.post("/{session_id}/segments/{idx}/watched")
async def mark_watched(session_id: str, idx: int, user: CurrentUser = Depends(get_current_user)):
    """Review only: a short segment (no readings fit inside it) watched with a face detected."""
    s = await _own_session(session_id, user)
    if s.get("mode") != "review" or not any(r["idx"] == idx for r in s.get("review_segments", [])):
        not_found()
    if s.get("ended_at"):
        raise HTTPException(status_code=409, detail="הסשן כבר הסתיים")
    await get_db().sessions.update_one({"_id": s["_id"]}, {"$addToSet": {"watched_idx": idx}})
    return {"idx": idx, "watched": True}


@router.get("", response_model=list[SessionSummary])
async def list_sessions(user: CurrentUser = Depends(get_current_user)):
    await close_stale_sessions(user.id)
    cursor = get_db().sessions.find({"owner_id": user.id}).sort("started_at", -1)
    return [summary_dict(s) async for s in cursor]


@router.get("/{session_id}", response_model=SessionDetailOut)
async def get_session(session_id: str, user: CurrentUser = Depends(get_current_user)):
    db = get_db()
    s = await _own_session(session_id, user)
    readings = await db.readings.find({"session_id": s["_id"]}).sort("created_at", 1).to_list(None)
    d = end_dict(s)
    d["content_exists"] = bool(await db.content.find_one(
        {"_id": s["content_id"], "owner_id": user.id}, {"_id": 1}))
    d["readings"] = [{k: r.get(k) for k in
                      ("position", "score", "smoothed", "level", "attention_peak", "created_at")}
                     for r in readings]
    return d
