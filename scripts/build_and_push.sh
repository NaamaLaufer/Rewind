#!/usr/bin/env bash
# Build both images for linux/amd64 (required by the graders, also on Apple Silicon) and push them
# to Docker Hub. Then writes the explicit user name into docker-compose.yml.
# Usage:  docker login   &&   DOCKERHUB_USER=yourname ./scripts/build_and_push.sh
set -euo pipefail
cd "$(dirname "$0")/.."

: "${DOCKERHUB_USER:?set DOCKERHUB_USER, e.g. DOCKERHUB_USER=yourname ./scripts/build_and_push.sh}"
TAG="${TAG:-1.0.0}"

bash scripts/prepare_assets.sh   # bakes the ONNX model into the frontend build context

docker buildx build --platform linux/amd64 -t "$DOCKERHUB_USER/rewind-backend:$TAG" --push ./backend
docker buildx build --platform linux/amd64 -t "$DOCKERHUB_USER/rewind-frontend:$TAG" --push ./frontend

# The submitted compose file must name the images explicitly (no variables).
sed -i.bak -E "s#image: \\$\\{DOCKERHUB_USER:-TODO_USER\\}/#image: $DOCKERHUB_USER/#; s#image: TODO_USER/#image: $DOCKERHUB_USER/#" docker-compose.yml
rm -f docker-compose.yml.bak
grep -n "image:" docker-compose.yml
echo
echo "Pushed. Now open https://hub.docker.com/repositories/$DOCKERHUB_USER and make sure both repos are PUBLIC."
