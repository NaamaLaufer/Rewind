// onnxruntime-web (WASM only). The model is loaded ONCE and reused for every window.
import * as ort from "onnxruntime-web/wasm";
import { LANDMARKS, MODEL_URL, WINDOW } from "./config.js";
import { argmax, clamp01, softmax } from "./modelMath.js";

// Production: the wasm runtime is served by our own nginx from /ort/.
// Dev server: Vite refuses to import() a .mjs from public/ (500), so let ORT resolve its own files
// from node_modules through Vite instead.
if (import.meta.env.PROD) ort.env.wasm.wasmPaths = "/ort/";
ort.env.wasm.numThreads = 1; // no SharedArrayBuffer -> no cross-origin isolation needed

let promise = null;

export function loadModel() {
  if (!promise) {
    promise = ort.InferenceSession.create(MODEL_URL, { executionProviders: ["wasm"] }).catch((e) => {
      promise = null;
      throw e;
    });
  }
  return promise;
}

/**
 * Run one window. frames: Float32Array(length * 478 * 3), chronological, raw MediaPipe x/y/z.
 * length = WINDOW (100) for real scores; 30 or 60 for the provisional score at the start (D-050):
 * the model's sequence axis is dynamic ("sequence_length").
 * Outputs are read BY NAME when present, so other model versions (v1-v3: single output) still work.
 */
export async function runModel(frames, length = WINDOW) {
  const session = await loadModel();
  const input = new ort.Tensor("float32", frames, [1, length, LANDMARKS, 3]);
  const out = await session.run({ [session.inputNames[0]]: input });

  const reg = out.regression_scores ?? out[session.outputNames[0]];
  const score = clamp01(Number(reg.data[0]));

  let level = null;
  let probs = null;
  if (out.classification_logits) {
    probs = softmax(out.classification_logits.data);
    level = argmax(probs);
  }

  let attentionPeak = null;
  if (out.attention_weights) {
    const w = out.attention_weights.data;
    attentionPeak = argmax(w) / Math.max(1, w.length - 1);
  }
  return { score, level, probs, attentionPeak };
}
