"""A4 (cloud): production settings. Each case imports the app in a fresh interpreter, because the
settings are read once at import time."""
import os
import subprocess
import sys

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def run(code: str, **env):
    full = {**os.environ, **env}
    return subprocess.run([sys.executable, "-c", code], cwd=BACKEND, env=full,
                          capture_output=True, text=True, timeout=60)


def test_production_without_jwt_secret_refuses_to_start():
    r = run("import app.config", ENV="production", JWT_SECRET="")
    assert r.returncode != 0
    assert "JWT_SECRET is required when ENV=production" in r.stderr


def test_development_without_jwt_secret_still_starts():
    r = run("import app.config as c; print(len(c.settings.jwt_secret))", ENV="development", JWT_SECRET="")
    assert r.returncode == 0 and r.stdout.strip().splitlines()[-1] == "64"


def test_production_docs_live_under_api():
    r = run("from app.main import app; print(app.docs_url, app.openapi_url)",
            ENV="production", JWT_SECRET="x" * 64)
    assert r.returncode == 0, r.stderr
    assert r.stdout.split() == ["/api/docs", "/api/openapi.json"]


def test_development_docs_stay_at_root():
    r = run("from app.main import app; print(app.docs_url)", ENV="development", JWT_SECRET="x" * 64)
    assert r.stdout.strip() == "/docs"
