"""Rewind API: app creation, lifespan, /health, routers and error handlers."""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import db
from .config import settings
from .routers import ai, analytics, auth, content, sessions, users

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("rewind")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.connect()
    yield
    await db.disconnect()


app = FastAPI(title="Rewind API", version="1.0.0", lifespan=lifespan,
              description="Rewind - לא מפספסים אף רגע. Attention-debt learning site.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list(),
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

for r in (auth.router, users.router, content.router, sessions.router, analytics.router, ai.router):
    app.include_router(r)


@app.get("/health", tags=["health"])
async def health():
    if await db.ping():
        return {"status": "ok"}
    return JSONResponse(status_code=503, content={"status": "unavailable", "detail": "מסד הנתונים לא זמין"})


# ---------- error handling: always {"detail": "<readable Hebrew message>"} ----------

FIELD_NAMES = {
    "email": "אימייל", "password": "סיסמה", "display_name": "שם תצוגה",
    "current_password": "סיסמה נוכחית", "new_password": "סיסמה חדשה",
    "title": "כותרת", "type": "סוג", "source": "מקור", "content_id": "פריט תוכן",
    "position": "מיקום", "score": "ציון", "smoothed": "ציון מוחלק", "level": "רמה",
    "attention_peak": "שיא קשב", "duration_seconds": "משך", "mode": "סוג סשן",
    "paragraph_index": "מספר פסקה", "review_of": "סשן מקורי",
}


def _has_hebrew(text: str) -> bool:
    return any("֐" <= ch <= "׿" for ch in text)


def humanize(err: dict) -> str:
    loc = [str(x) for x in err.get("loc", ()) if x not in ("body", "query", "path")]
    field = loc[-1] if loc else ""
    name = FIELD_NAMES.get(field, field or "קלט")
    etype = err.get("type", "")
    msg = str(err.get("msg", ""))
    ctx = err.get("ctx") or {}

    if etype == "missing":
        return f"נא למלא את השדה '{name}'"
    if field == "email" and etype != "missing":
        return "כתובת האימייל לא תקינה. לדוגמה: name@example.com"
    if etype == "value_error" and _has_hebrew(msg):
        return msg.removeprefix("Value error, ")
    if etype == "string_too_short":
        return f"השדה '{name}' חייב להכיל לפחות {ctx.get('min_length')} תווים"
    if etype == "string_too_long":
        return f"השדה '{name}' יכול להכיל עד {ctx.get('max_length')} תווים"
    if etype in ("greater_than_equal", "greater_than"):
        return f"הערך של '{name}' קטן מדי (מינימום {ctx.get('ge', ctx.get('gt'))})"
    if etype in ("less_than_equal", "less_than"):
        return f"הערך של '{name}' גדול מדי (מקסימום {ctx.get('le', ctx.get('lt'))})"
    if etype == "literal_error":
        return f"הערך של '{name}' לא נתמך"
    if etype == "json_invalid":
        return "גוף הבקשה אינו JSON תקין"
    return f"הערך של '{name}' לא תקין"


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    errors = exc.errors()
    # Path params that fail validation (e.g. a malformed id) -> 404, never 422.
    if errors and errors[0].get("loc", ("",))[0] == "path":
        return JSONResponse(status_code=404, content={"detail": "לא נמצא"})
    # Never echo the submitted input back (it may contain a password).
    safe = [{"loc": list(e.get("loc", ())), "type": e.get("type"), "message": humanize(e)} for e in errors]
    return JSONResponse(status_code=422, content={"detail": safe[0]["message"] if safe else "קלט לא תקין",
                                                  "errors": safe})


@app.exception_handler(StarletteHTTPException)
async def http_handler(request: Request, exc: StarletteHTTPException):
    detail = exc.detail
    if exc.status_code == 404 and detail == "Not Found":
        detail = "לא נמצא"
    elif exc.status_code == 405:
        detail = "הפעולה לא נתמכת בנתיב הזה"
    return JSONResponse(status_code=exc.status_code, content={"detail": detail},
                        headers=getattr(exc, "headers", None))


@app.exception_handler(Exception)
async def unhandled_handler(request: Request, exc: Exception):
    log.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "שגיאה פנימית בשרת. נסי שוב בעוד רגע"})
