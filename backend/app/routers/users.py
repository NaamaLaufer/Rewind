"""Current-user profile: read, rename, change password, delete account."""
import re

from fastapi import APIRouter, Depends, HTTPException, status

from ..db import get_db
from ..schemas import DisplayNameIn, PasswordChangeIn, UserMe
from ..security import (CurrentUser, get_current_user, hash_password,
                        verify_password)

router = APIRouter(prefix="/api/users", tags=["users"])


def _me(doc: dict) -> UserMe:
    return UserMe(
        id=str(doc["_id"]),
        email=doc["email"],
        display_name=doc["display_name"],
        created_at=doc["created_at"],
    )


@router.get("/me", response_model=UserMe)
async def get_me(user: CurrentUser = Depends(get_current_user)):
    return _me(user.doc)


@router.patch("/me", response_model=UserMe)
async def update_me(body: DisplayNameIn, user: CurrentUser = Depends(get_current_user)):
    db = get_db()
    await db.users.update_one(
        {"_id": user.id}, {"$set": {"display_name": body.display_name.strip()}}
    )
    doc = await db.users.find_one({"_id": user.id})
    return _me(doc)


@router.post("/me/password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(body: PasswordChangeIn, user: CurrentUser = Depends(get_current_user)):
    db = get_db()
    if not verify_password(body.current_password, user.doc["password_hash"]):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="הסיסמה הנוכחית שגויה")
    # Bump token_version so every existing token becomes invalid.
    await db.users.update_one(
        {"_id": user.id},
        {"$set": {"password_hash": hash_password(body.new_password)},
         "$inc": {"token_version": 1}},
    )


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_me(user: CurrentUser = Depends(get_current_user)):
    db = get_db()
    await db.readings.delete_many({"owner_id": user.id})
    await db.sessions.delete_many({"owner_id": user.id})
    await db.content.delete_many({"owner_id": user.id})
    await db.login_attempts.delete_many({"key": {"$regex": f"^{re.escape(user.email)}\\|"}})
    await db.users.delete_one({"_id": user.id})
    # The current token dies too (the user no longer exists, but be explicit).
    await db.revoked_tokens.insert_one({"jti": user.jti, "expires_at": user.exp})
