// D-048 experiment: (1) does the head-pose heuristic (frontend/src/focus/gaze.js) separate looking
// at the camera from looking away, and (2) which model (v4_2 / v4_7 / v4_66) separates them best?
//
// Input: landmarks cached by model_compare.py (e2e/fixtures/experiments/cache/*.npy, [N,2,478,3],
// index 0 = raw full-frame landmarks at 10 fps). "Looking-away" clips are made from the focused
// clip (akiyo) by rotating its 3-D landmarks (yaw 40°, pitch -35° = looking down at a phone), so
// everything except the head pose stays identical.
//
// Usage (from the repo root): node scripts/experiments/gaze_models.mjs
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const require = createRequire(path.join(root, "e2e", "package.json"));
const ort = require("onnxruntime-node");
const gaze = await import(pathToFileURL(path.join(root, "frontend/src/focus/gaze.js")).href);

const CACHE = path.join(root, "e2e/fixtures/experiments/cache");
const MODELS = path.join(root, "materials/focusflow-models");
const ASPECT = 352 / 288; // CIF / QCIF

function loadNpy(file) {
  const buf = fs.readFileSync(file);
  const hlen = buf.readUInt16LE(8);
  const header = buf.slice(10, 10 + hlen).toString();
  const shape = header.match(/\(([^)]*)\)/)[1].split(",").filter((s) => s.trim()).map(Number);
  const data = new Float32Array(buf.buffer.slice(buf.byteOffset + 10 + hlen, buf.byteOffset + buf.length));
  return { shape, data };
}

// -> array of frames, each a Float32Array(478*3) of raw landmarks
function rawFrames(name) {
  const { shape, data } = loadNpy(path.join(CACHE, `${name}.y4m.npy`));
  const [n, , p, c] = shape;
  const per = p * c;
  return Array.from({ length: n }, (_, i) => data.slice(i * 2 * per, i * 2 * per + per));
}

function rotate(frame, yawDeg, pitchDeg) {
  const out = new Float32Array(frame.length);
  let cx = 0, cy = 0, cz = 0;
  const n = frame.length / 3;
  for (let i = 0; i < n; i++) { cx += frame[i * 3]; cy += frame[i * 3 + 1] / ASPECT; cz += frame[i * 3 + 2]; }
  cx /= n; cy /= n; cz /= n;
  const a = (yawDeg * Math.PI) / 180, b = (pitchDeg * Math.PI) / 180;
  for (let i = 0; i < n; i++) {
    let x = frame[i * 3] - cx, y = frame[i * 3 + 1] / ASPECT - cy, z = frame[i * 3 + 2] - cz;
    [x, z] = [x * Math.cos(a) + z * Math.sin(a), -x * Math.sin(a) + z * Math.cos(a)]; // yaw
    [y, z] = [y * Math.cos(b) - z * Math.sin(b), y * Math.sin(b) + z * Math.cos(b)]; // pitch
    out[i * 3] = x + cx; out[i * 3 + 1] = (y + cy) * ASPECT; out[i * 3 + 2] = z + cz;
  }
  return out;
}

const asFace = (f) => Array.from({ length: f.length / 3 }, (_, i) => ({ x: f[i * 3], y: f[i * 3 + 1], z: f[i * 3 + 2] }));

function loop100(frames) {
  const out = [];
  while (out.length < 100 + 75) out.push(...frames);
  return out;
}
const windows = (frames) => {
  const f = loop100(frames);
  const w = [];
  for (let s = 0; s + 100 <= f.length; s += 25) w.push(f.slice(s, s + 100));
  return w;
};

const akiyo = rawFrames("akiyo_cif");
const clips = {
  "akiyo (מביטה למצלמה)": akiyo,
  "grandma (מביטה למצלמה)": rawFrames("grandma_qcif"),
  "akiyo מסובבת 40° הצידה (סינתטי)": akiyo.map((f) => rotate(f, 40, 0)),
  "akiyo מביטה למטה 35° (סינתטי)": akiyo.map((f) => rotate(f, 0, -35)),
  "foreman (מסתכל סביב)": rawFrames("foreman_cif"),
  "mother_daughter (מביטה בבת)": rawFrames("mother_daughter_cif"),
};

// (1) heuristic, with the neutral pose taken from each user's own first frames, like the app does;
//     the synthetic clips reuse akiyo's neutral (same person, same camera).
const neutralAkiyo = gaze.neutralPose(akiyo.slice(0, 100).map((f) => gaze.headPose(asFace(f), ASPECT)));
console.log("neutral akiyo:", Object.fromEntries(Object.entries(neutralAkiyo).map(([k, v]) => [k, +v.toFixed(3)])));
console.log("\n== heuristic ==");
for (const [name, frames] of Object.entries(clips)) {
  const poses = frames.map((f) => gaze.headPose(asFace(f), ASPECT));
  const own = name.includes("סינתטי") ? neutralAkiyo : gaze.neutralPose(poses.slice(0, 100));
  const away = poses.filter((p) => gaze.classifyPose(p, own).away).length;
  const closed = poses.filter((p) => gaze.classifyPose(p, own).closed).length;
  // sustained trigger (> 4 s) after the 10 s calibration, frames at 10 fps
  let st = gaze.initialGazeState(), triggers = 0;
  poses.forEach((p, i) => {
    if (i < gaze.NEUTRAL_FRAMES && !name.includes("סינתטי")) return;
    const was = st.sustained;
    st = gaze.stepGaze(st, gaze.classifyPose(p, own), i * 100);
    if (st.sustained && !was) triggers++;
  });
  const absNeutral = poses.filter((p) => gaze.classifyPose(p, neutralAkiyo).away).length;
  const med = (k) => gaze.median(poses.map((p) => p[k])).toFixed(2);
  console.log(`${name}: yaw ${med("yaw")}° pitch ${med("pitch")}° ear ${med("ear")} | away vs own neutral ${Math.round((100 * away) / poses.length)}% closed ${Math.round((100 * closed) / poses.length)}% triggers ${triggers} | vs akiyo neutral ${Math.round((100 * absNeutral) / poses.length)}%`);
}

// (2) models
console.log("\n== models (mean score over 100-frame windows) ==");
for (const v of ["v4_2", "v4_7", "v4_66"]) {
  const sess = await ort.InferenceSession.create(path.join(MODELS, `${v}.onnx`));
  const cells = [];
  for (const [name, frames] of Object.entries(clips)) {
    const scores = [];
    for (const w of windows(frames)) {
      const t = new Float32Array(100 * 478 * 3);
      w.forEach((f, i) => t.set(f, i * 478 * 3));
      const out = await sess.run({ [sess.inputNames[0]]: new ort.Tensor("float32", t, [1, 100, 478, 3]) });
      scores.push(out.regression_scores.data[0]);
    }
    const m = scores.reduce((a, b) => a + b, 0) / scores.length;
    cells.push(`${name.split(" ")[0]}${name.includes("סינתטי") ? (name.includes("למטה") ? "↓" : "↔") : ""}=${m.toFixed(2)}`);
  }
  console.log(`${v.padEnd(6)} ${cells.join("  ")}`);
}
