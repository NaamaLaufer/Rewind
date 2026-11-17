"""Variant D: move the face to the frame center WITHOUT rescaling, vs raw (A). Uses the cache
written by model_compare.py. Usage: python center_test.py <cache_dir> <model.onnx> [...]"""
import glob
import os
import sys

import numpy as np
import onnxruntime as ort

cache, models = sys.argv[1], sys.argv[2:]
vids = {os.path.basename(p).split("_")[0]: np.load(p)[:, 0] for p in sorted(glob.glob(os.path.join(cache, "*.npy")))}
vids = {k: v for k, v in vids.items() if len(v) >= 30}


def center(seq):
    out = seq.copy()
    cx = (seq[:, :, 0].min(1) + seq[:, :, 0].max(1)) / 2
    cy = (seq[:, :, 1].min(1) + seq[:, :, 1].max(1)) / 2
    out[:, :, 0] += (0.5 - cx)[:, None]
    out[:, :, 1] += (0.5 - cy)[:, None]
    return out


def score(sess, seq):
    if len(seq) < 100:
        seq = np.concatenate([seq] * (100 // len(seq) + 2))
    name = sess.get_inputs()[0].name
    return np.mean([float(sess.run(None, {name: seq[s:s + 100][None].astype(np.float32)})[0][0][0])
                    for s in range(0, len(seq) - 99, 25)])


for m in models:
    sess = ort.InferenceSession(m)
    print(os.path.basename(m))
    for k, v in vids.items():
        print(f"  {k:9s} raw={score(sess, v):.2f}  centered={score(sess, center(v)):.2f}")
