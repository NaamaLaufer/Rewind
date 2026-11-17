"""Pydantic request/response models. Strict types prevent Mongo-operator injection."""
import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

# ---------- auth / users ----------

_PW_MIN, _PW_MAX = 8, 128


def _validate_password(v: str) -> str:
    if len(v) < _PW_MIN:
        raise ValueError("הסיסמה חייבת להכיל לפחות 8 תווים")
    if len(v) > _PW_MAX:
        raise ValueError("הסיסמה ארוכה מדי (עד 128 תווים)")
    if not any(c.isalpha() for c in v):  # any letter, Hebrew included
        raise ValueError("הסיסמה חייבת להכיל לפחות אות אחת")
    if not re.search(r"\d", v):
        raise ValueError("הסיסמה חייבת להכיל לפחות ספרה אחת")
    return v


def _clean_name(v: str) -> str:
    v = " ".join(v.split())
    if not v:
        raise ValueError("נא למלא שם תצוגה")
    if len(v) > 80:
        raise ValueError("שם התצוגה יכול להכיל עד 80 תווים")
    return v


class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    display_name: str

    @field_validator("password")
    @classmethod
    def _pw(cls, v):
        return _validate_password(v)

    @field_validator("display_name")
    @classmethod
    def _name(cls, v):
        return _clean_name(v)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=1024)


class UserPublic(BaseModel):
    id: str
    email: str
    display_name: str


class UserMe(UserPublic):
    created_at: datetime


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class DisplayNameIn(BaseModel):
    display_name: str

    @field_validator("display_name")
    @classmethod
    def _name(cls, v):
        return _clean_name(v)


class PasswordChangeIn(BaseModel):
    current_password: str = Field(min_length=1, max_length=1024)
    new_password: str

    @field_validator("new_password")
    @classmethod
    def _pw(cls, v):
        return _validate_password(v)


# ---------- content ----------

ContentType = Literal["youtube", "text", "web"]


class ContentIn(BaseModel):
    title: str = Field(max_length=200)
    type: ContentType
    source: str = Field(min_length=1, max_length=200_000)

    @field_validator("title")
    @classmethod
    def _title(cls, v):
        v = " ".join(v.split())
        if not v:
            raise ValueError("נא למלא כותרת")
        return v

    @field_validator("source")
    @classmethod
    def _source(cls, v):
        if not v.strip():
            raise ValueError("נא למלא קישור או טקסט")
        return v.strip()


class ContentOut(BaseModel):
    id: str
    title: str
    type: ContentType
    source: str
    youtube_id: str | None = None
    body_paragraphs: list[str] | None = None
    site_name: str | None = None
    duration_seconds: float | None = None
    created_at: datetime


class ContentListItem(BaseModel):
    id: str
    title: str
    type: ContentType
    youtube_id: str | None = None
    site_name: str | None = None
    created_at: datetime


class DurationIn(BaseModel):
    duration_seconds: float = Field(gt=0, le=86_400)


# ---------- sessions / readings ----------

SessionMode = Literal["watch", "review"]


class SessionIn(BaseModel):
    content_id: str
    mode: SessionMode = "watch"
    review_of: str | None = None


class ReviewSegment(BaseModel):
    idx: int          # index inside the original session's missed_segments
    start: float
    end: float


class SessionOut(BaseModel):
    id: str
    content_id: str
    mode: SessionMode
    started_at: datetime
    review_of: str | None = None
    review_segments: list[ReviewSegment] = []


class ReadingIn(BaseModel):
    position: float = Field(ge=0, le=10_000_000, allow_inf_nan=False)
    score: float = Field(ge=0, le=1, allow_inf_nan=False)
    smoothed: float | None = Field(default=None, ge=0, le=1, allow_inf_nan=False)
    level: int | None = Field(default=None, ge=0, le=4)
    attention_peak: float | None = Field(default=None, ge=0, le=1, allow_inf_nan=False)
    # The client's low-focus decision (personal threshold or a sustained look-away), D-045/D-046
    low: bool | None = None
    threshold: float | None = Field(default=None, ge=0, le=1, allow_inf_nan=False)
    looking_away: bool | None = None


class NoFaceGapIn(BaseModel):
    """Content range (seconds or paragraph position) during which no face was visible for > 5 s."""
    start: float = Field(ge=0, le=10_000_000, allow_inf_nan=False)
    end: float = Field(ge=0, le=10_000_000, allow_inf_nan=False)

    @model_validator(mode="after")
    def _ordered(self):
        if self.end < self.start:
            raise ValueError("סוף הקטע חייב להיות אחרי ההתחלה")
        return self


class ReadingOut(BaseModel):
    position: float
    score: float
    created_at: datetime


class ReadingDetail(BaseModel):
    position: float
    score: float
    smoothed: float | None = None
    level: int | None = None
    attention_peak: float | None = None
    low: bool | None = None
    threshold: float | None = None
    looking_away: bool | None = None
    created_at: datetime


class Segment(BaseModel):
    start: float
    end: float
    closed: bool = False
    closed_by: str | None = None


class SessionSummary(BaseModel):
    id: str
    content_id: str
    content_title: str
    content_type: str
    mode: SessionMode
    started_at: datetime
    ended_at: datetime | None = None
    reading_count: int
    average_score: float | None = None
    debt_seconds: float = 0.0
    debt_unit: str = "seconds"


class SessionEndOut(SessionSummary):
    missed_segments: list[Segment] = []
    # review-only extras
    review_of: str | None = None
    review_segments: list[ReviewSegment] = []
    segments_closed: int | None = None
    segments_total: int | None = None
    debt_remaining: float | None = None


class SessionDetailOut(SessionEndOut):
    content_exists: bool = True
    no_face_gaps: list[NoFaceGapIn] = []
    readings: list[ReadingDetail] = []


# ---------- debt / analytics ----------

class OpenSegment(BaseModel):
    session_id: str
    start: float
    end: float


class DebtOut(BaseModel):
    open_segments: list[OpenSegment]
    debt_total: float
    debt_unit: str
    completion: float | None = None


# ---------- ai ----------

class AiStatusOut(BaseModel):
    enabled: bool


class CheckQuestionIn(BaseModel):
    content_id: str
    paragraph_index: int = Field(ge=0)


class CheckQuestionOut(BaseModel):
    question: str
    options: list[str]
    answer_index: int
