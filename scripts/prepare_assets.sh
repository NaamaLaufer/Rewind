#!/usr/bin/env bash
# Copies the v4_7 attention model into the frontend build context, so it is baked INTO the image
# (the model is never downloaded at runtime). Only v4_7 is copied, not all nine models.
set -euo pipefail
cd "$(dirname "$0")/.."

SRC="materials/focusflow-models/v4_7.onnx"
DST="frontend/public/models/v4_7.onnx"

if [ ! -f "$SRC" ]; then
  echo "ERROR: $SRC not found. Put the course models in materials/focusflow-models/." >&2
  exit 1
fi
mkdir -p "$(dirname "$DST")"
cp "$SRC" "$DST"
echo "copied $SRC -> $DST ($(du -h "$DST" | cut -f1))"
