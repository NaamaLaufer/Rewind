#!/usr/bin/env bash
# Runs every automated test: backend pytest (real Mongo in Docker), frontend Vitest, model check,
# and (if the dev stack is up on :3000) Playwright E2E.
# Usage: ./scripts/run_tests.sh [--e2e]
set -euo pipefail
cd "$(dirname "$0")/.."
export MSYS_NO_PATHCONV=1

echo "== backend: pytest =="
docker network create rewind-test >/dev/null 2>&1 || true
docker rm -f rewind-test-mongo >/dev/null 2>&1 || true
docker run -d --name rewind-test-mongo --network rewind-test --network-alias mongo mongo:7 >/dev/null
docker build -q -t rewind-backend-test -f backend/Dockerfile.test backend >/dev/null
sleep 3
docker run --rm --network rewind-test -v "$PWD/backend:/app" -w /app -e GEMINI_API_KEY= \
  rewind-backend-test python -m pytest -q -p no:cacheprovider
docker rm -f rewind-test-mongo >/dev/null

echo "== frontend: vitest =="
(cd frontend && npx vitest run)

echo "== model check =="
node scripts/check_model.mjs

if [ "${1:-}" = "--e2e" ]; then
  echo "== e2e: playwright (needs: docker compose -f docker-compose.dev.yml up -d --build) =="
  (cd e2e && npx playwright test)
fi
