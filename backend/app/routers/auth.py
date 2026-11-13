"""Authentication: register, login, logout."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pymongo.errors import DuplicateKeyError

from ..db import get_db
from ..rate_limit import clear_attempts, record_attempt, too_many_attempts
from ..schemas import LoginIn, RegisterIn, TokenOut, UserPublic
from ..security import (DUMMY_HASH, CurrentUser, create_access_token,
                        get_current_user, hash_password, verify_password)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", status_code=status.HTTP_201_CREATED, response_model=UserPublic)
async def register(body: RegisterIn):
    db = get_db()
    email = body.email.strip().lower()
    doc = {
        "email": email,
        "password_hash": hash_password(body.password),
        "display_name": body.display_name.strip(),
        "created_at": datetime.now(timezone.utc),
        "token_version": 0,
    }
    try:
        res = await db.users.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="כתובת האימייל הזו כבר רשומה",
        )
    return UserPublic(id=str(res.inserted_id), email=email, display_name=doc["display_name"])


@router.post("/login", response_model=TokenOut)
async def login(body: LoginIn, request: Request):
    db = get_db()
    email = body.email.strip().lower()
    ip = request.client.host if request.client else "unknown"

    if await too_many_attempts(email, ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="יותר מדי ניסיונות. נסי שוב בעוד כמה דקות",
        )

    user = await db.users.find_one({"email": email})
    ok = verify_password(body.password, user["password_hash"] if user else DUMMY_HASH)
    if user is None or not ok:
        await record_attempt(email, ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="האימייל או הסיסמה שגויים",
        )

    await clear_attempts(email, ip)
    token, expires_in = create_access_token(str(user["_id"]), user.get("token_version", 0))
    return TokenOut(access_token=token, expires_in=expires_in)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(user: CurrentUser = Depends(get_current_user)):
    db = get_db()
    await db.revoked_tokens.insert_one({"jti": user.jti, "expires_at": user.exp})
