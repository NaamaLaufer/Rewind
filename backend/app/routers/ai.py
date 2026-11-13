"""Optional Gemini 'quick check question'. Without GEMINI_API_KEY it reports disabled / 503."""
import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException

from ..db import get_db
from ..schemas import AiStatusOut, CheckQuestionIn, CheckQuestionOut
from ..security import CurrentUser, get_current_user
from ..services import gemini
from ..utils import not_found, parse_oid

router = APIRouter(prefix="/api/ai", tags=["ai"])
log = logging.getLogger("rewind.ai")


@router.get("/status", response_model=AiStatusOut)
async def ai_status(user: CurrentUser = Depends(get_current_user)):
    return AiStatusOut(enabled=gemini.is_enabled())


@router.post("/check-question", response_model=CheckQuestionOut)
async def check_question(body: CheckQuestionIn, user: CurrentUser = Depends(get_current_user)):
    if not gemini.is_enabled():
        raise HTTPException(status_code=503, detail="תכונת ה-AI לא מוגדרת בשרת הזה")
    # The text comes from OUR database (owner-filtered), never from the client.
    content = await get_db().content.find_one(
        {"_id": parse_oid(body.content_id), "owner_id": user.id})
    if content is None or not content.get("body_paragraphs"):
        not_found()
    paras = content["body_paragraphs"]
    i = min(body.paragraph_index, len(paras) - 1)
    context = paras[max(0, i - 2): i + 1]
    try:
        return await asyncio.wait_for(gemini.generate_question(context), timeout=gemini.TIMEOUT)
    except Exception as e:  # never log the content itself
        log.warning("Gemini question failed: %s", type(e).__name__)
        raise HTTPException(status_code=502, detail="לא הצלחנו ליצור שאלה כרגע. אפשר להמשיך לקרוא ולנסות שוב מאוחר יותר")
