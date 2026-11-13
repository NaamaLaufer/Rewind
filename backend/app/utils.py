"""Small shared helpers: ObjectId parsing, YouTube id extraction, text splitting."""
import re

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import HTTPException, status

NOT_FOUND = "לא נמצא"

# Accept all common YouTube URL shapes and bare 11-char ids.
_YT_PATTERNS = [
    re.compile(r"(?:v=|/v/|youtu\.be/|/embed/|/shorts/)([A-Za-z0-9_-]{11})"),
    re.compile(r"^([A-Za-z0-9_-]{11})$"),
]


def parse_oid(value: str) -> ObjectId:
    """Parse an id from a path. An invalid id becomes a 404 (never 422/500)."""
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)


def not_found():
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)


def extract_youtube_id(source: str) -> str | None:
    source = source.strip()
    for pat in _YT_PATTERNS:
        m = pat.search(source)
        if m:
            return m.group(1)
    return None


def split_paragraphs(text: str) -> list[str]:
    """Split pasted text into paragraphs on blank lines, falling back to single lines."""
    parts = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    if len(parts) <= 1:
        parts = [p.strip() for p in text.splitlines() if p.strip()]
    return parts or [text.strip()]
