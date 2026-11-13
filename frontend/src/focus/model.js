// onnxruntime-web (WASM only). The model is loaded ONCE and reused for every window.
import * as ort from "onnxruntime-web/wasm";
import { LANDMARKS, MODEL_URL, WINDOW } from "./config.js";
import { argmax, clamp01, softmax } from "./modelMath.js";

ort.env.wasm.wasmPaths = "/ort/"; // served by our own nginx
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
 * Run one window. frames: Float32Array(WINDOW * 478 * 3), chronological, raw MediaPipe x/y/z.
 * Outputs are read BY NAME when present, so other model versions (v1-v3: single output) still work.
 */
export async function runModel(frames) {
  const session = await loadModel();
  const input = new ort.Tensor("float32", frames, [1, WINDOW, LANDMARKS, 3]);
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
