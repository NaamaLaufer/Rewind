"""Integration fixtures: a real MongoDB (from docker compose) with a throw-away database per test."""
import os
import uuid

import httpx
import pytest

from app import db
from app.main import app

MONGO = os.environ.get("TEST_MONGODB_URI", "mongodb://mongo:27017")


@pytest.fixture
async def client():
    name = f"rewind_test_{uuid.uuid4().hex[:10]}"
    await db.connect(MONGO, name)
    transport = httpx.ASGITransport(app=app, client=("10.0.0.1", 1234))
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    await db._client.drop_database(name)
    await db.disconnect()


async def register(c, email="a@example.com", password="secret123", name="Alice"):
    return await c.post("/api/auth/register",
                        json={"email": email, "password": password, "display_name": name})


async def login_headers(c, email="a@example.com", password="secret123", name="Alice"):
    await register(c, email, password, name)
    r = await c.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


YT = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"


async def make_youtube(c, h, title="סרטון"):
    r = await c.post("/api/content", headers=h, json={"title": title, "type": "youtube", "source": YT})
    assert r.status_code == 201, r.text
    return r.json()
