"""Analytics overview for the History ("archive") page."""
from datetime import timedelta

from fastapi import APIRouter, Depends, Query

from ..db import get_db
from ..security import CurrentUser, get_current_user
from .content import compute_content_debt
from .sessions import _avg, close_stale_sessions

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


def _tz_string(offset_minutes: int) -> str:
    """JS getTimezoneOffset() (UTC - local, in minutes) -> Mongo timezone like '+02:00'."""
    local = -offset_minutes
    sign = "+" if local >= 0 else "-"
    local = abs(local)
    return f"{sign}{local // 60:02d}:{local % 60:02d}"


@router.get("/overview")
async def overview(
    tz_offset_minutes: int = Query(0, ge=-840, le=840),
    user: CurrentUser = Depends(get_current_user),
):
    db = get_db()
    await close_stale_sessions(user.id)
    sessions = await db.sessions.find({"owner_id": user.id}).sort("started_at", 1).to_list(None)

    total_seconds = 0.0
    total_readings, total_score = 0, 0.0
    trend, by_type = [], {}
    for s in sessions:
        if s.get("ended_at"):
            total_seconds += max(0.0, (s["ended_at"] - s["started_at"]).total_seconds())
        n = s.get("reading_count", 0)
        total_readings += n
        total_score += s.get("score_sum", 0.0)
        if n:
            trend.append({"session_id": str(s["_id"]), "started_at": s["started_at"],
                          "average_score": _avg(s), "content_title": s.get("content_title"),
                          "mode": s.get("mode", "watch")})
            t = by_type.setdefault(s.get("content_type", "other"), [0.0, 0])
            t[0] += s.get("score_sum", 0.0)
            t[1] += n

    # Average score per local hour of day, computed from individual readings.
    pipeline = [
        {"$match": {"owner_id": user.id}},
        {"$group": {"_id": {"$hour": {"date": "$created_at", "timezone": _tz_string(tz_offset_minutes)}},
                    "avg": {"$avg": "$score"}, "count": {"$sum": 1}}},
        {"$sort": {"_id": 1}},
    ]
    by_hour = [{"hour": h["_id"], "average_score": round(h["avg"], 4), "count": h["count"]}
               async for h in await db.readings.aggregate(pipeline)]
    candidates = [h for h in by_hour if h["count"] >= 3] or by_hour
    best_hour = max(candidates, key=lambda h: h["average_score"])["hour"] if candidates else None

    # Content items that still have open attention debt.
    debt_items, debt_seconds_total, debt_paragraphs_total = [], 0.0, 0.0
    content_ids = {s["content_id"] for s in sessions
                   if s.get("mode") == "watch" and any(not x.get("closed") for x in s.get("missed_segments", []))}
    if content_ids:
        async for c in db.content.find({"_id": {"$in": list(content_ids)}, "owner_id": user.id}):
            debt = await compute_content_debt(c, user.id)
            if debt.debt_total <= 0:
                continue
            if debt.debt_unit == "seconds":
                debt_seconds_total += debt.debt_total
            else:
                debt_paragraphs_total += debt.debt_total
            debt_items.append({
                "content_id": str(c["_id"]), "title": c["title"], "type": c["type"],
                "debt_total": debt.debt_total, "debt_unit": debt.debt_unit,
                "completion": debt.completion,
                # The most recent session that still has open segments = next Second Pass target.
                "review_session_id": debt.open_segments[0].session_id,
            })

    return {
        "total_sessions": len(sessions),
        "total_minutes": round(total_seconds / 60, 1),
        "average_score": round(total_score / total_readings, 4) if total_readings else None,
        "total_readings": total_readings,
        "trend": trend,
        "by_hour": by_hour,
        "best_hour": best_hour,
        "by_type": [{"type": k, "average_score": round(v[0] / v[1], 4)} for k, v in by_type.items()],
        "debt_seconds_total": round(debt_seconds_total, 1),
        "debt_paragraphs_total": int(debt_paragraphs_total),
        "debt_items": debt_items,
    }
