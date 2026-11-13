"""Password hashing, JWT creation/verification, and the current-user dependency."""
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, InvalidHashError
from bson import ObjectId
from bson.errors import InvalidId
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import settings
from .db import get_db

_ph = PasswordHasher()  # argon2id with sensible defaults (salt is embedded per hash)

_bearer = HTTPBearer(auto_error=False)

AUTH_ERROR = "נדרשת התחברות מחדש"


def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _ph.verify(password_hash, password)
    except (VerifyMismatchError, InvalidHashError, Exception):
        return False


# Verified against when the email does not exist, so both failure paths take similar time
# (an attacker can't learn which emails are registered from response timing).
DUMMY_HASH = _ph.hash("timing-equalizer-not-a-real-password-1")


def create_access_token(user_id: str, token_version: int) -> tuple[str, int]:
    """Return (token, expires_in_seconds)."""
    expire_seconds = settings.jwt_expire_minutes * 60
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "jti": str(uuid.uuid4()),
        "tv": token_version,
        "iat": now,
        "exp": now + timedelta(seconds=expire_seconds),
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return token, expire_seconds


class CurrentUser:
    def __init__(self, doc: dict, jti: str, exp: datetime):
        self.doc = doc
        self.id = doc["_id"]
        self.email = doc["email"]
        self.display_name = doc["display_name"]
        self.jti = jti
        self.exp = exp


def _unauthorized():
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=AUTH_ERROR,
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> CurrentUser:
    if creds is None or not creds.credentials:
        _unauthorized()

    try:
        payload = jwt.decode(
            creds.credentials, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
    except jwt.PyJWTError:
        _unauthorized()

    sub = payload.get("sub")
    jti = payload.get("jti")
    tv = payload.get("tv")
    if not sub or not jti:
        _unauthorized()

    db = get_db()

    # Token revoked (logout)?
    if await db.revoked_tokens.find_one({"jti": jti}):
        _unauthorized()

    try:
        user = await db.users.find_one({"_id": ObjectId(sub)})
    except (InvalidId, TypeError):
        _unauthorized()

    if user is None:
        _unauthorized()

    # token_version must match (password change bumps it, invalidating old tokens)
    if payload.get("tv") != user.get("token_version", 0):
        _unauthorized()

    exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
    return CurrentUser(user, jti, exp)
