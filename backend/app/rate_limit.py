"""Login attempt rate limiting, backed by Mongo with a TTL index (shared by every instance).

Two limits inside the same window:
- 5 failures per (email, client IP): the normal case;
- 20 failures per email from ANY IP: the client IP comes from X-Forwarded-For behind the load
  balancer, and a client can put anything there, so the first limit alone can be bypassed.
"""
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
    if count >= settings.login_max_attempts:
        return True
    per_email = await db.login_attempts.count_documents(
        {"email": email.strip().lower(), "created_at": {"$gte": window_start}}
    )
    return per_email >= settings.login_max_attempts_per_email


async def record_attempt(email: str, ip: str) -> None:
    db = get_db()
    key = f"{email.strip().lower()}|{ip}"
    await db.login_attempts.insert_one(
        {"key": key, "email": email.strip().lower(), "created_at": datetime.now(timezone.utc)}
    )


async def clear_attempts(email: str, ip: str) -> None:
    db = get_db()
    key = f"{email.strip().lower()}|{ip}"
    await db.login_attempts.delete_many({"key": key})
