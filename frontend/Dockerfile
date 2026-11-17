# ---- stage 1: build the static site ----
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
# public/models/v4_7.onnx must already be in the build context (scripts/prepare_assets.sh copies it).
RUN test -f public/models/v4_7.onnx || (echo "missing public/models/v4_7.onnx - run scripts/prepare_assets.sh" && exit 1)
# Copy MediaPipe + onnxruntime wasm into public/ and download face_landmarker.task (build time only).
RUN node scripts/fetch-assets.mjs && test -f public/mediapipe/face_landmarker.task && test -f public/mediapipe/blaze_face_short_range.tflite
RUN npm run build

# ---- stage 2: serve with nginx ----
# The SAME image runs in docker compose (assignment 3) and in Cloud Run (assignment 4):
#   PORT        nginx listens here (Cloud Run sets it; default 3000).
#   BACKEND_URL non-empty -> nginx also proxies /api and /health there (compose).
#               empty     -> no proxy; the cloud load balancer routes /api (see 40-api-proxy.sh).
FROM nginx:1.27-alpine
ENV PORT=3000     BACKEND_URL=http://backend:8000     NGINX_RESOLVER=127.0.0.11     NGINX_ENVSUBST_FILTER="^PORT$"
COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --chmod=755 docker-entrypoint.d/40-api-proxy.sh /docker-entrypoint.d/40-api-proxy.sh
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 3000
