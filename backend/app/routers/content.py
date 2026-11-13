"""Content items: YouTube, pasted text, or a fetched web page. Plus per-item debt."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from ..db import get_db
from ..schemas import (ContentIn, ContentListItem, ContentOut, DebtOut,
                       DurationIn, OpenSegment)
from ..security import CurrentUser, get_current_user
from ..services import segments as seg
from ..services.webpage import WebpageError, fetch_readable_text
from ..utils import extract_youtube_id, not_found, parse_oid, split_paragraphs

router = APIRouter(prefix="/api/content", tags=["content"])


def _to_out(doc: dict) -> ContentOut:
    return ContentOut(
        id=str(doc["_id"]),
        title=doc["title"],
        type=doc["type"],
        source=doc["source"],
        youtube_id=doc.get("youtube_id"),
        body_paragraphs=doc.get("body_paragraphs"),
        site_name=doc.get("site_name"),
        duration_seconds=doc.get("duration_seconds"),
        created_at=doc["created_at"],
    )


@router.post("", status_code=status.HTTP_201_CREATED, response_model=ContentOut)
async def create_content(body: ContentIn, user: CurrentUser = Depends(get_current_user)):
    db = get_db()
    doc = {
        "owner_id": user.id,
        "title": body.title.strip(),
        "type": body.type,
        "source": body.source.strip(),
        "youtube_id": None,
        "body_paragraphs": None,
        "site_name": None,
        "duration_seconds": None,
        "created_at": datetime.now(timezone.utc),
    }

    if body.type == "youtube":
        yt = extract_youtube_id(body.source)
        if not yt:
            raise HTTPException(status_code=422,
                                detail="הקישור אינו קישור YouTube תקין")
        doc["youtube_id"] = yt

    elif body.type == "text":
        doc["body_paragraphs"] = split_paragraphs(body.source)

    elif body.type == "web":
        if len(body.source) > 2000:
            raise HTTPException(status_code=422,
                                detail="כתובת הדף ארוכה מדי")
        try:
            paragraphs, site_name = await fetch_readable_text(body.source)
        except WebpageError as e:
            raise HTTPException(status_code=422,
                                detail=str(e))
        doc["body_paragraphs"] = paragraphs
        doc["site_name"] = site_name

    res = await db.content.insert_one(doc)
    doc["_id"] = res.inserted_id
    return _to_out(doc)


@router.get("", response_model=list[ContentListItem])
async def list_content(user: CurrentUser = Depends(get_current_user)):
    db = get_db()
    cursor = db.content.find({"owner_id": user.id}).sort("created_at", -1)
    items = []
    async for d in cursor:
        items.append(ContentListItem(
            id=str(d["_id"]), title=d["title"], type=d["type"],
            youtube_id=d.get("youtube_id"), site_name=d.get("site_name"),
            created_at=d["created_at"],
        ))
    return items


@router.get("/{content_id}", response_model=ContentOut)
async def get_content(content_id: str, user: CurrentUser = Depends(get_current_user)):
    db = get_db()
    doc = await db.content.find_one({"_id": parse_oid(content_id), "owner_id": user.id})
    if doc is None:
        not_found()
    return _to_out(doc)


@router.patch("/{content_id}", response_model=ContentOut)
async def update_content(content_id: str, body: DurationIn,
                         user: CurrentUser = Depends(get_current_user)):
    db = get_db()
    oid = parse_oid(content_id)
    res = await db.content.update_one(
        {"_id": oid, "owner_id": user.id},
        {"$set": {"duration_seconds": body.duration_seconds}},
    )
    if res.matched_count == 0:
        not_found()
    doc = await db.content.find_one({"_id": oid, "owner_id": user.id})
    return _to_out(doc)


@router.delete("/{content_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_content(content_id: str, user: CurrentUser = Depends(get_current_user)):
    db = get_db()
    res = await db.content.delete_one({"_id": parse_oid(content_id), "owner_id": user.id})
    if res.deleted_count == 0:
        not_found()
    # Sessions stay in history (they keep content_title).


@router.get("/{content_id}/debt", response_model=DebtOut)
async def content_debt(content_id: str, user: CurrentUser = Depends(get_current_user)):
    db = get_db()
    oid = parse_oid(content_id)
    content = await db.content.find_one({"_id": oid, "owner_id": user.id})
    if content is None:
        not_found()

    return await compute_content_debt(content, user.id)


async def compute_content_debt(content: dict, owner_id) -> DebtOut:
    """Open debt of one content item across all its watch sessions (overlaps counted once)."""
    db = get_db()
    unit = seg.unit_for(content["type"])
    open_segments: list[OpenSegment] = []
    raw: list[dict] = []
    cursor = db.sessions.find(
        {"owner_id": owner_id, "content_id": content["_id"], "mode": "watch",
         "ended_at": {"$ne": None}}
    ).sort("started_at", -1)
    async for s in cursor:
        for seg_doc in s.get("missed_segments", []):
            if not seg_doc.get("closed"):
                open_segments.append(OpenSegment(
                    session_id=str(s["_id"]), start=seg_doc["start"], end=seg_doc["end"]))
                raw.append(seg_doc)
    debt_total = seg.union_debt(raw, unit)

    total = None
    if unit == "paragraphs" and content.get("body_paragraphs"):
        total = len(content["body_paragraphs"])
    elif unit == "seconds" and content.get("duration_seconds"):
        total = content["duration_seconds"]
    completion = round(max(0.0, min(1.0, 1 - debt_total / total)), 4) if total else None

    return DebtOut(open_segments=open_segments, debt_total=debt_total,
                   debt_unit=unit, completion=completion)
