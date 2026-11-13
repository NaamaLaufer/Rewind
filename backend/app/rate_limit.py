"""Login attempt rate limiting, backed by Mongo with a TTL index."""
from datetime import datetime, timedelta, timezone

from .config import settings
from .db import get_db


async def too_many_attempts(email: str, ip: str) -> bool:
    db = get_db()
    key = f"{email.strip().lower()}|{ip}"
    window_start = datetime.now(timezone.utc) - timedelta(minutes=settings.login_window_minutes)
    count = await db.login_attempts.count_documents(
        {"key": key, "created_at": {"$gte": window_start}}
    )
    return count >= settings.login_max_attempts


async def record_attempt(email: str, ip: str) -> None:
    db = get_db()
    key = f"{email.strip().lower()}|{ip}"
    await db.login_attempts.insert_one(
        {"key": key, "created_at": datetime.now(timezone.utc)}
    )


async def clear_attempts(email: str, ip: str) -> None:
    db = get_db()
    key = f"{email.strip().lower()}|{ip}"
    await db.login_attempts.delete_many({"key": key})
