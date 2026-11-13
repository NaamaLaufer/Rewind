"""Integration tests against a real MongoDB."""
import pytest

from app.services.webpage import WebpageError, check_url
from tests.conftest import YT, login_headers, make_youtube, register


# ---------- health ----------

async def test_health(client):
    r = await client.get("/health")
    assert r.status_code == 200 and r.json() == {"status": "ok"}


# ---------- register ----------

async def test_register_ok_and_no_hash(client):
    r = await register(client)
    assert r.status_code == 201
    body = r.json()
    assert set(body) == {"id", "email", "display_name"}
    assert "password" not in r.text and "hash" not in r.text


async def test_register_duplicate_case_insensitive(client):
    await register(client, email="Dup@Example.com")
    r = await register(client, email="dup@example.COM")
    assert r.status_code == 409
    assert "detail" in r.json()


async def test_register_short_password_hebrew_detail(client):
    r = await register(client, password="a1")
    assert r.status_code == 422
    assert r.json()["detail"] == "הסיסמה חייבת להכיל לפחות 8 תווים"
    assert "a1" not in r.text  # input never echoed


async def test_register_password_needs_digit_and_letter(client):
    assert (await register(client, password="abcdefgh")).json()["detail"] == "הסיסמה חייבת להכיל לפחות ספרה אחת"
    assert (await register(client, password="12345678")).json()["detail"] == "הסיסמה חייבת להכיל לפחות אות אחת"


async def test_register_bad_email(client):
    r = await register(client, email="not-an-email")
    assert r.status_code == 422 and "אימייל" in r.json()["detail"]


async def test_register_rejects_operator_injection(client):
    r = await client.post("/api/auth/register",
                          json={"email": {"$ne": ""}, "password": "secret123", "display_name": "x"})
    assert r.status_code == 422


# ---------- login / logout / me ----------

async def test_login_and_me(client):
    h = await login_headers(client)
    r = await client.get("/api/users/me", headers=h)
    assert r.status_code == 200
    me = r.json()
    assert me["display_name"] == "Alice" and me["created_at"].endswith("Z")


async def test_login_wrong_password(client):
    await register(client)
    r = await client.post("/api/auth/login", json={"email": "a@example.com", "password": "wrong1234"})
    assert r.status_code == 401 and r.json()["detail"] == "האימייל או הסיסמה שגויים"


async def test_login_rate_limit(client):
    await register(client)
    for _ in range(5):
        r = await client.post("/api/auth/login", json={"email": "a@example.com", "password": "bad12345"})
        assert r.status_code == 401
    r = await client.post("/api/auth/login", json={"email": "a@example.com", "password": "secret123"})
    assert r.status_code == 429


async def test_login_response_shape(client):
    await register(client)
    r = await client.post("/api/auth/login", json={"email": "A@EXAMPLE.com", "password": "secret123"})
    assert r.status_code == 200
    assert r.json()["token_type"] == "bearer" and r.json()["expires_in"] == 3600


async def test_no_token_401(client):
    assert (await client.get("/api/users/me")).status_code == 401
    assert (await client.get("/api/users/me", headers={"Authorization": "Bearer junk"})).status_code == 401


async def test_logout_revokes_token(client):
    h = await login_headers(client)
    assert (await client.post("/api/auth/logout", headers=h)).status_code == 204
    assert (await client.get("/api/users/me", headers=h)).status_code == 401


# ---------- profile ----------

async def test_patch_me(client):
    h = await login_headers(client)
    r = await client.patch("/api/users/me", headers=h, json={"display_name": "  נעמה  "})
    assert r.status_code == 200 and r.json()["display_name"] == "נעמה"


async def test_password_change_invalidates_old_tokens(client):
    h = await login_headers(client)
    bad = await client.post("/api/users/me/password", headers=h,
                            json={"current_password": "nope1234", "new_password": "newpass123"})
    assert bad.status_code == 400
    r = await client.post("/api/users/me/password", headers=h,
                          json={"current_password": "secret123", "new_password": "newpass123"})
    assert r.status_code == 204
    assert (await client.get("/api/users/me", headers=h)).status_code == 401
    r = await client.post("/api/auth/login", json={"email": "a@example.com", "password": "newpass123"})
    assert r.status_code == 200


async def test_delete_account_cascades(client):
    h = await login_headers(client)
    c = await make_youtube(client, h)
    s = (await client.post("/api/sessions", headers=h, json={"content_id": c["id"]})).json()
    await client.post(f"/api/sessions/{s['id']}/readings", headers=h, json={"position": 1, "score": 0.5})
    assert (await client.delete("/api/users/me", headers=h)).status_code == 204
    from app.db import get_db
    db = get_db()
    for coll in ("users", "content", "sessions", "readings"):
        assert await db[coll].count_documents({}) == 0, coll
    assert (await client.get("/api/users/me", headers=h)).status_code == 401


# ---------- content ----------

@pytest.mark.parametrize("url", [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ?t=5",
    "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    "https://www.youtube.com/embed/dQw4w9WgXcQ",
    "https://m.youtube.com/watch?feature=share&v=dQw4w9WgXcQ",
])
async def test_youtube_id_extraction(client, url):
    h = await login_headers(client)
    r = await client.post("/api/content", headers=h, json={"title": "t", "type": "youtube", "source": url})
    assert r.status_code == 201 and r.json()["youtube_id"] == "dQw4w9WgXcQ"


async def test_content_bad_type_and_bad_youtube(client):
    h = await login_headers(client)
    r = await client.post("/api/content", headers=h, json={"title": "t", "type": "pdf", "source": "x"})
    assert r.status_code == 422
    r = await client.post("/api/content", headers=h, json={"title": "t", "type": "youtube", "source": "https://example.com"})
    assert r.status_code == 422


async def test_text_content_paragraphs(client):
    h = await login_headers(client)
    r = await client.post("/api/content", headers=h,
                          json={"title": "מאמר", "type": "text", "source": "פסקה 1\n\nפסקה 2\n\nפסקה 3"})
    assert r.status_code == 201 and r.json()["body_paragraphs"] == ["פסקה 1", "פסקה 2", "פסקה 3"]


async def test_content_list_get_delete(client):
    h = await login_headers(client)
    a = await make_youtube(client, h, "ראשון")
    b = await make_youtube(client, h, "שני")
    lst = (await client.get("/api/content", headers=h)).json()
    assert [x["id"] for x in lst] == [b["id"], a["id"]]  # newest first
    assert (await client.get(f"/api/content/{a['id']}", headers=h)).status_code == 200
    assert (await client.delete(f"/api/content/{a['id']}", headers=h)).status_code == 204
    assert (await client.get(f"/api/content/{a['id']}", headers=h)).status_code == 404


async def test_patch_duration(client):
    h = await login_headers(client)
    c = await make_youtube(client, h)
    r = await client.patch(f"/api/content/{c['id']}", headers=h, json={"duration_seconds": 212.5})
    assert r.status_code == 200 and r.json()["duration_seconds"] == 212.5


# ---------- isolation ----------

async def test_isolation_between_users(client):
    ha = await login_headers(client, "a@example.com")
    c = await make_youtube(client, ha)
    s = (await client.post("/api/sessions", headers=ha, json={"content_id": c["id"]})).json()
    hb = await login_headers(client, "b@example.com", name="Bob")
    assert (await client.get("/api/content", headers=hb)).json() == []
    r1 = await client.get(f"/api/content/{c['id']}", headers=hb)
    r2 = await client.get("/api/content/aaaaaaaaaaaaaaaaaaaaaaaa", headers=hb)
    assert r1.status_code == r2.status_code == 404 and r1.json() == r2.json()
    assert (await client.delete(f"/api/content/{c['id']}", headers=hb)).status_code == 404
    assert (await client.get(f"/api/sessions/{s['id']}", headers=hb)).status_code == 404
    assert (await client.post(f"/api/sessions/{s['id']}/readings", headers=hb,
                              json={"position": 1, "score": 0.5})).status_code == 404
    assert (await client.post("/api/sessions", headers=hb, json={"content_id": c["id"]})).status_code == 404
    assert (await client.get("/api/sessions", headers=hb)).json() == []


async def test_invalid_object_id_is_404(client):
    h = await login_headers(client)
    assert (await client.get("/api/content/not-an-id", headers=h)).status_code == 404
    assert (await client.get("/api/sessions/123", headers=h)).status_code == 404
    assert (await client.post("/api/sessions/zzz/end", headers=h)).status_code == 404


# ---------- sessions / readings ----------

async def test_session_flow_average_and_idempotent_end(client):
    h = await login_headers(client)
    c = await make_youtube(client, h)
    r = await client.post("/api/sessions", headers=h, json={"content_id": c["id"]})
    assert r.status_code == 201
    s = r.json()
    assert s["mode"] == "watch" and s["started_at"].endswith("Z")
    for pos, sc in [(10, 0.6), (12, 0.8), (14, 1.0)]:
        rr = await client.post(f"/api/sessions/{s['id']}/readings", headers=h, json={"position": pos, "score": sc})
        assert rr.status_code == 201 and set(rr.json()) == {"position", "score", "created_at"}
    end1 = (await client.post(f"/api/sessions/{s['id']}/end", headers=h)).json()
    assert end1["reading_count"] == 3 and end1["average_score"] == pytest.approx(0.8)
    assert end1["ended_at"] is not None and end1["debt_seconds"] == 0
    end2 = (await client.post(f"/api/sessions/{s['id']}/end", headers=h)).json()
    assert end2 == end1
    r = await client.post(f"/api/sessions/{s['id']}/readings", headers=h, json={"position": 16, "score": 0.5})
    assert r.status_code == 409
    lst = (await client.get("/api/sessions", headers=h)).json()
    assert lst[0]["id"] == s["id"] and lst[0]["average_score"] == pytest.approx(0.8)
    assert lst[0]["content_id"] == c["id"]
    det = (await client.get(f"/api/sessions/{s['id']}", headers=h)).json()
    assert len(det["readings"]) == 3 and det["readings"][0]["position"] == 10


async def test_end_without_readings_average_null(client):
    h = await login_headers(client)
    c = await make_youtube(client, h)
    s = (await client.post("/api/sessions", headers=h, json={"content_id": c["id"]})).json()
    end = (await client.post(f"/api/sessions/{s['id']}/end", headers=h)).json()
    assert end["average_score"] is None and end["reading_count"] == 0


@pytest.mark.parametrize("body", [
    {"position": 1, "score": 1.5},
    {"position": -1, "score": 0.5},
    {"position": 1},
    {"position": 1, "score": "high"},
    {"position": 1, "score": 0.5, "level": 9},
])
async def test_reading_validation(client, body):
    h = await login_headers(client)
    c = await make_youtube(client, h)
    s = (await client.post("/api/sessions", headers=h, json={"content_id": c["id"]})).json()
    r = await client.post(f"/api/sessions/{s['id']}/readings", headers=h, json=body)
    assert r.status_code == 422 and isinstance(r.json()["detail"], str)


# ---------- attention debt + second pass (integration) ----------

async def _watch_with_low_readings(client, h, c):
    s = (await client.post("/api/sessions", headers=h, json={"content_id": c["id"]})).json()
    # high 0..18, low 20..30, high after -> one segment [10, 30]
    for pos in range(0, 42, 2):
        sc = 0.2 if 20 <= pos <= 30 else 0.8
        await client.post(f"/api/sessions/{s['id']}/readings", headers=h,
                          json={"position": pos, "score": sc, "smoothed": sc})
    end = (await client.post(f"/api/sessions/{s['id']}/end", headers=h)).json()
    return s, end


async def test_debt_and_second_pass_closes_segment(client):
    h = await login_headers(client)
    c = await make_youtube(client, h)
    await client.patch(f"/api/content/{c['id']}", headers=h, json={"duration_seconds": 100})
    s, end = await _watch_with_low_readings(client, h, c)
    assert [(x["start"], x["end"]) for x in end["missed_segments"]] == [(10.0, 30.0)]
    assert end["debt_seconds"] == 20.0 and end["debt_unit"] == "seconds"

    debt = (await client.get(f"/api/content/{c['id']}/debt", headers=h)).json()
    assert debt["debt_total"] == 20.0 and debt["completion"] == pytest.approx(0.8)

    rv = await client.post("/api/sessions", headers=h,
                           json={"content_id": c["id"], "mode": "review", "review_of": s["id"]})
    assert rv.status_code == 201
    rv = rv.json()
    assert rv["review_segments"] == [{"idx": 0, "start": 10.0, "end": 30.0}]
    for pos in (12, 16, 20, 24, 28):
        await client.post(f"/api/sessions/{rv['id']}/readings", headers=h,
                          json={"position": pos, "score": 0.9, "smoothed": 0.9})
    rend = (await client.post(f"/api/sessions/{rv['id']}/end", headers=h)).json()
    assert rend["mode"] == "review" and rend["segments_closed"] == 1 and rend["debt_remaining"] == 0
    orig = (await client.get(f"/api/sessions/{s['id']}", headers=h)).json()
    assert orig["debt_seconds"] == 0 and orig["missed_segments"][0]["closed"] is True
    debt = (await client.get(f"/api/content/{c['id']}/debt", headers=h)).json()
    assert debt["debt_total"] == 0 and debt["completion"] == 1.0
    # nothing left to review
    again = await client.post("/api/sessions", headers=h,
                              json={"content_id": c["id"], "mode": "review", "review_of": s["id"]})
    assert again.status_code == 422


async def test_review_with_low_focus_keeps_debt(client):
    h = await login_headers(client)
    c = await make_youtube(client, h)
    s, _ = await _watch_with_low_readings(client, h, c)
    rv = (await client.post("/api/sessions", headers=h,
                            json={"content_id": c["id"], "mode": "review", "review_of": s["id"]})).json()
    await client.post(f"/api/sessions/{rv['id']}/readings", headers=h, json={"position": 20, "score": 0.1})
    rend = (await client.post(f"/api/sessions/{rv['id']}/end", headers=h)).json()
    assert rend["segments_closed"] == 0 and rend["debt_remaining"] == 20.0
    assert rend["missed_segments"] == []  # review never creates new debt


async def test_watched_endpoint_for_short_segment(client):
    h = await login_headers(client)
    c = await make_youtube(client, h)
    s = (await client.post("/api/sessions", headers=h, json={"content_id": c["id"]})).json()
    await client.post(f"/api/sessions/{s['id']}/readings", headers=h, json={"position": 4, "score": 0.1})
    end = (await client.post(f"/api/sessions/{s['id']}/end", headers=h)).json()
    assert end["debt_seconds"] == 4.0
    rv = (await client.post("/api/sessions", headers=h,
                            json={"content_id": c["id"], "mode": "review", "review_of": s["id"]})).json()
    assert (await client.post(f"/api/sessions/{rv['id']}/segments/5/watched", headers=h)).status_code == 404
    assert (await client.post(f"/api/sessions/{rv['id']}/segments/0/watched", headers=h)).status_code == 200
    rend = (await client.post(f"/api/sessions/{rv['id']}/end", headers=h)).json()
    assert rend["segments_closed"] == 1
    assert (await client.post(f"/api/sessions/{rv['id']}/segments/0/watched", headers=h)).status_code == 409


async def test_review_of_other_user_is_404(client):
    ha = await login_headers(client, "a@example.com")
    ca = await make_youtube(client, ha)
    sa, _ = await _watch_with_low_readings(client, ha, ca)
    hb = await login_headers(client, "b@example.com", name="Bob")
    cb = await make_youtube(client, hb)
    r = await client.post("/api/sessions", headers=hb,
                          json={"content_id": cb["id"], "mode": "review", "review_of": sa["id"]})
    assert r.status_code == 404


async def test_text_debt_in_paragraphs(client):
    h = await login_headers(client)
    c = (await client.post("/api/content", headers=h,
                           json={"title": "t", "type": "text", "source": "a\n\nb\n\nc\n\nd"})).json()
    s = (await client.post("/api/sessions", headers=h, json={"content_id": c["id"]})).json()
    for pos, sc in [(0.1, 0.9), (1.2, 0.1), (1.7, 0.2), (2.5, 0.9)]:
        await client.post(f"/api/sessions/{s['id']}/readings", headers=h, json={"position": pos, "score": sc})
    end = (await client.post(f"/api/sessions/{s['id']}/end", headers=h)).json()
    assert end["debt_unit"] == "paragraphs" and end["debt_seconds"] == 1
    debt = (await client.get(f"/api/content/{c['id']}/debt", headers=h)).json()
    assert debt["completion"] == pytest.approx(0.75)


async def test_analytics_overview(client):
    h = await login_headers(client)
    c = await make_youtube(client, h)
    await _watch_with_low_readings(client, h, c)
    r = await client.get("/api/analytics/overview?tz_offset_minutes=-120", headers=h)
    assert r.status_code == 200
    o = r.json()
    assert o["total_sessions"] == 1 and len(o["trend"]) == 1 and o["by_hour"]
    assert o["debt_seconds_total"] == 20.0 and o["debt_items"][0]["content_id"] == c["id"]


# ---------- AI ----------

async def test_ai_disabled_without_key(client):
    h = await login_headers(client)
    assert (await client.get("/api/ai/status", headers=h)).json() == {"enabled": False}
    r = await client.post("/api/ai/check-question", headers=h,
                          json={"content_id": "aaaaaaaaaaaaaaaaaaaaaaaa", "paragraph_index": 0})
    assert r.status_code == 503 and r.json()["detail"] == "תכונת ה-AI לא מוגדרת בשרת הזה"


# ---------- SSRF ----------

@pytest.mark.parametrize("url", [
    "http://localhost/", "http://127.0.0.1:8000/health", "http://mongo:27017",
    "http://169.254.169.254/latest/meta-data/", "http://[::1]/", "http://10.0.0.5/",
    "file:///etc/passwd", "http://backend:8000/health", "http://0.0.0.0/",
])
async def test_ssrf_blocked(url):
    with pytest.raises(WebpageError):
        await check_url(url)


async def test_ssrf_blocked_through_api(client):
    h = await login_headers(client)
    r = await client.post("/api/content", headers=h,
                          json={"title": "x", "type": "web", "source": "http://169.254.169.254/latest"})
    assert r.status_code == 422 and isinstance(r.json()["detail"], str)
