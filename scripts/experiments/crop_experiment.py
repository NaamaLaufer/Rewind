"""Experiment: does cropping the face (as in training) change v4_2's score?

Training used landmarks extracted from a face crop (256px, 20% margin around the face).
The browser gives landmarks normalized to the FULL camera frame. We compare, on the same video:
  A) raw full-frame landmarks          (what the site sent originally)
  B) full-frame landmarks re-expressed in a 20%-margin square face crop (affine transform)
  C) landmarks re-detected on an actual 256x256 crop image (what training did)

Run (docker):  see docs/TEST_REPORT.md -> "ניסוי חיתוך פנים"
"""
import sys

import cv2
import numpy as np
import onnxruntime as ort
import mediapipe as mp
from mediapipe.tasks.python import vision
from mediapipe.tasks.python.core.base_options import BaseOptions

VIDEO, TASK, MODEL = sys.argv[1], sys.argv[2], sys.argv[3]
MARGIN = 0.20


def landmarker():
    return vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=TASK),
        running_mode=vision.RunningMode.IMAGE, num_faces=1))


def detect(lm, rgb):
    res = lm.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb)))
    if not res.face_landmarks:
        return None
    return np.array([[p.x, p.y, p.z] for p in res.face_landmarks[0]], dtype=np.float32)


def crop_box(pts, w, h):
    xs, ys = pts[:, 0] * w, pts[:, 1] * h
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    side = max(x1 - x0, y1 - y0) * (1 + 2 * MARGIN)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    return cx - side / 2, cy - side / 2, side


def to_crop_coords(pts, w, h):
    left, top, side = crop_box(pts, w, h)
    out = pts.copy()
    out[:, 0] = (pts[:, 0] * w - left) / side
    out[:, 1] = (pts[:, 1] * h - top) / side
    out[:, 2] = pts[:, 2] * w / side
    return out


def main():
    cap = cv2.VideoCapture(VIDEO)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    step = max(1, round(fps / 10))  # sample at 10 fps like the site
    lm = landmarker()
    A, B, C = [], [], []
    i = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if i % step == 0:
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            h, w = rgb.shape[:2]
            pts = detect(lm, rgb)
            if pts is not None:
                A.append(pts)
                B.append(to_crop_coords(pts, w, h))
                left, top, side = crop_box(pts, w, h)
                pad = int(side)
                padded = cv2.copyMakeBorder(rgb, pad, pad, pad, pad, cv2.BORDER_CONSTANT)
                x0, y0 = int(left) + pad, int(top) + pad
                crop = cv2.resize(padded[y0:y0 + int(side), x0:x0 + int(side)], (256, 256))
                pc = detect(lm, crop)
                C.append(pc if pc is not None else B[-1])
        i += 1

    sess = ort.InferenceSession(MODEL)
    name = sess.get_inputs()[0].name
    print(f"frames with a face (10fps): {len(A)}")
    for label, seq in (("A raw full frame", A), ("B affine crop", B), ("C re-detected crop", C)):
        arr = np.stack(seq)
        scores = []
        for start in range(0, len(arr) - 100 + 1, 20):
            out = sess.run(None, {name: arr[start:start + 100][None]})
            scores.append(float(out[0][0][0]))
        s = np.array(scores)
        print(f"{label:22s} windows={len(s):3d} mean={s.mean():.3f} min={s.min():.3f} max={s.max():.3f} "
              f"x-range=({arr[:, :, 0].min():.2f},{arr[:, :, 0].max():.2f})")


if __name__ == "__main__":
    main()
