// Copies the runtime assets the browser needs into public/ (served same-origin, no CDN at runtime):
//   public/mediapipe/wasm/*        <- @mediapipe/tasks-vision/wasm
//   public/mediapipe/face_landmarker.task  <- downloaded once (skipped if present)
//   public/mediapipe/blaze_face_short_range.tflite <- downloaded once (debug panel only)
//   public/ort/*                   <- onnxruntime-web wasm runtime
//   public/models/v4_7.onnx        <- ../materials/focusflow-models (skipped if present / missing)
// Usage: npm run fetch-assets   (the Docker build runs the same steps)
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "public");
const DETECTOR_URL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";
const TASK_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

function copyDir(src, dst, filter = () => true) {
  mkdirSync(dst, { recursive: true });
  for (const f of readdirSync(src).filter(filter)) copyFileSync(join(src, f), join(dst, f));
}

copyDir(join(root, "node_modules/@mediapipe/tasks-vision/wasm"), join(pub, "mediapipe/wasm"));
copyDir(join(root, "node_modules/onnxruntime-web/dist"), join(pub, "ort"),
  (f) => /^ort-wasm-simd-threaded\.(wasm|mjs)$/.test(f));
console.log("copied mediapipe + onnxruntime wasm");

const model = join(pub, "models/v4_7.onnx");
const src = resolve(root, "../materials/focusflow-models/v4_7.onnx");
if (!existsSync(model) && existsSync(src)) {
  mkdirSync(dirname(model), { recursive: true });
  copyFileSync(src, model);
  console.log("copied v4_7.onnx");
} else if (!existsSync(model)) {
  console.warn("WARNING: public/models/v4_7.onnx missing - run scripts/prepare_assets.sh");
}

async function download(url, dst) {
  if (existsSync(dst)) return;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${res.status} ${url}`);
  writeFileSync(dst, Buffer.from(await res.arrayBuffer()));
  console.log("downloaded", dst.split(/[\/]/).pop());
}

await download(TASK_URL, join(pub, "mediapipe/face_landmarker.task"));
// Used only by the ?debug=1 panel to show a face-detection confidence score.
await download(DETECTOR_URL, join(pub, "mediapipe/blaze_face_short_range.tflite"));
