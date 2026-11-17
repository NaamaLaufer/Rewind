"""Compare all 9 models on the same real landmark windows, raw vs. face-crop coordinates.

Usage: python model_compare.py <videos_dir> <face_landmarker.task> <models_dir> <cache_dir>
Landmarks are extracted once per video (10 fps) and cached as .npy.
"""
import glob
import os
import sys

import numpy as np
import onnxruntime as ort

sys.path.insert(0, os.path.dirname(__file__))
import crop_experiment as ce  # noqa: E402

VIDEOS, TASK, MODELS, CACHE = sys.argv[1:5]
ce.TASK = TASK
os.makedirs(CACHE, exist_ok=True)


def landmarks(video):
    key = os.path.join(CACHE, os.path.basename(video) + ".npy")
    if os.path.exists(key):
        return np.load(key)
    import cv2
    cap = cv2.VideoCapture(video)
    step = max(1, round((cap.get(cv2.CAP_PROP_FPS) or 30) / 10))
    lm, frames, i = ce.landmarker(), [], 0
    while True:
        ok, f = cap.read()
        if not ok:
            break
        if i % step == 0:
            rgb = cv2.cvtColor(f, cv2.COLOR_BGR2RGB)
            p = ce.detect(lm, rgb)
            if p is not None:
                h, w = rgb.shape[:2]
                frames.append(np.stack([p, ce.to_crop_coords(p, w, h)]))
        i += 1
    arr = np.stack(frames) if frames else np.zeros((0, 2, 478, 3), np.float32)
    np.save(key, arr)
    return arr


def windows(seq):
    if len(seq) < 100:  # loop short clips, like the browser's fake camera does
        reps = int(np.ceil(100 / max(1, len(seq)))) + 1
        seq = np.concatenate([seq] * reps)
    return [seq[s:s + 100] for s in range(0, len(seq) - 99, 25)]


vids = {os.path.basename(v).split("_")[0]: landmarks(v) for v in sorted(glob.glob(os.path.join(VIDEOS, "*.y4m")))}
vids = {k: v for k, v in vids.items() if len(v) >= 30}
print("videos:", {k: len(v) for k, v in vids.items()})
for mpath in sorted(glob.glob(os.path.join(MODELS, "*.onnx"))):
    sess = ort.InferenceSession(mpath)
    name = sess.get_inputs()[0].name
    outs = [o.name for o in sess.get_outputs()]
    line = []
    for mode, idx in (("raw", 0), ("crop", 1)):
        cells = []
        for vname, arr in vids.items():
            sc, cls = [], []
            for w in windows(arr[:, idx]):
                r = sess.run(None, {name: w[None].astype(np.float32)})
                sc.append(float(r[0][0][0]))
                if "classification_logits" in outs:
                    cls.append(int(np.argmax(r[outs.index("classification_logits")][0])))
            c = f"/c{max(set(cls), key=cls.count)}" if cls else ""
            cells.append(f"{vname[:7]}={np.mean(sc):.2f}{c}")
        line.append(f"{mode}: " + " ".join(cells))
    print(f"{os.path.basename(mpath):12s} | " + " | ".join(line))
