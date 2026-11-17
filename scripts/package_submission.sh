#!/usr/bin/env bash
# Builds submission/assignment3.zip with exactly three files at the ROOT of the zip:
#   docker-compose.yml   .env   PROJECT_INFO.docx
# - submission/.env is created once (random JWT_SECRET, empty GEMINI_API_KEY) and then reused.
# - PROJECT_INFO.docx is regenerated from scripts/make_project_info.py (runs in a container).
# Usage: ./scripts/package_submission.sh [--authors a@grunitech.com,b@grunitech.com]
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p submission

AUTHORS_ARG=()
if [ "${1:-}" = "--authors" ] && [ -n "${2:-}" ]; then AUTHORS_ARG=(--authors "$2"); fi

# 1) .env for the graders (local values only, no real secrets)
if [ ! -f submission/.env ]; then
  SECRET=$(docker run --rm python:3.12-slim python -c "import secrets; print(secrets.token_hex(32))")
  cat > submission/.env <<EOF
MONGODB_URI=mongodb://mongo:27017
DB_NAME=rewind
JWT_SECRET=$SECRET
JWT_EXPIRE_MINUTES=60
ALLOWED_ORIGINS=http://localhost:3000
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
EOF
  echo "created submission/.env"
fi

# 2) PROJECT_INFO.docx
MSYS_NO_PATHCONV=1 docker run --rm -v "$PWD:/w" -w /w python:3.12-slim \
  sh -c "pip install -q --root-user-action=ignore python-docx==1.2.0 && python scripts/make_project_info.py ${AUTHORS_ARG[*]:-}"

# 3) the zip (python zipfile: works the same on Windows / macOS / Linux)
cp docker-compose.yml submission/docker-compose.yml
MSYS_NO_PATHCONV=1 docker run --rm -v "$PWD/submission:/s" -w /s python:3.12-slim python -c "
import zipfile
with zipfile.ZipFile('assignment3.zip', 'w', zipfile.ZIP_DEFLATED) as z:
    for name in ('docker-compose.yml', '.env', 'PROJECT_INFO.docx'):
        z.write(name, arcname=name)
for i in zipfile.ZipFile('assignment3.zip').infolist():
    print(f'{i.file_size:>8}  {i.filename}')
"

# 4) checks
warn=0
grep -q "^GEMINI_API_KEY=$" submission/.env || { echo "WARNING: GEMINI_API_KEY is not empty in submission/.env"; warn=1; }
if grep -q "TODO_USER" submission/docker-compose.yml; then
  echo "WARNING: docker-compose.yml still says TODO_USER - run DOCKERHUB_USER=... ./scripts/build_and_push.sh first"; warn=1
fi
echo "submission/assignment3.zip ready$( [ $warn = 1 ] && echo ' (with warnings above)')"
