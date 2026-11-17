"""MongoDB connection and index setup."""
from pymongo import ASCENDING, DESCENDING
from pymongo import AsyncMongoClient

from .config import settings

_client: AsyncMongoClient | None = None
_db = None


def get_db():
    """Return the active database handle (set during startup)."""
    if _db is None:
        raise RuntimeError("Database not initialised")
    return _db


async def connect(uri: str | None = None, db_name: str | None = None, client=None):
    """Open the connection and create indexes. `client` lets tests inject a mock."""
    global _client, _db
    if client is not None:
        _client = client
    else:
        # tz_aware=True: datetimes come back as UTC-aware, so the API emits ISO 8601 with "Z".
        _client = AsyncMongoClient(uri or settings.mongodb_uri, tz_aware=True,
                                   serverSelectionTimeoutMS=5000)
    _db = _client[db_name or settings.db_name]
    await _ensure_indexes(_db)
    return _db


async def disconnect():
    global _client, _db
    if _client is not None:
        await _client.close()
    _client = None
    _db = None


async def ping() -> bool:
    try:
        await _client.admin.command("ping")
        return True
    except Exception:
        return False


async def _ensure_indexes(db):
    await db.users.create_index([("email", ASCENDING)], unique=True)
    await db.content.create_index([("owner_id", ASCENDING), ("created_at", DESCENDING)])
    await db.sessions.create_index([("owner_id", ASCENDING), ("started_at", DESCENDING)])
    await db.sessions.create_index([("owner_id", ASCENDING), ("content_id", ASCENDING)])
    await db.readings.create_index([("session_id", ASCENDING), ("created_at", ASCENDING)])
    await db.readings.create_index([("owner_id", ASCENDING)])
    await db.revoked_tokens.create_index("jti")
    await db.login_attempts.create_index("key")
    await db.login_attempts.create_index("email")
    # TTL: revoked tokens vanish once they would have expired anyway.
    await db.revoked_tokens.create_index("expires_at", expireAfterSeconds=0)
    # TTL: login attempts expire after the rate-limit window.
    await db.login_attempts.create_index(
        "created_at", expireAfterSeconds=settings.login_window_minutes * 60
    )
