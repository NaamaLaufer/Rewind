// MediaPipe FaceLandmarker (478 landmarks), loaded from local files (no CDN at runtime).
//
// D-051: ONE INSTANCE PER MEASUREMENT. The focus engine creates its own landmarker when the camera
// turns on, is its only user, and closes it when the measurement stops. Nothing stateful is shared
// between sessions: a FaceLandmarker that was ever fed an unready frame stays broken for good
// (measured: every later call fails), and a page-wide singleton carried such a broken (or closed)
// instance into the next session until the page was refreshed.
// Only the immutable assets (wasm fileset + model bytes) are cached and shared.
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { preferredDelegate } from "./config.js";

let assets = null;

/** Download the wasm runtime and the model bytes once (safe to share: they never change). */
export function loadLandmarkerAssets() {
  if (!assets) {
    assets = Promise.all([
      FilesetResolver.forVisionTasks("/mediapipe/wasm"),
      fetch("/mediapipe/face_landmarker.task").then(async (r) => {
        if (!r.ok) throw new Error(`face_landmarker.task: HTTP ${r.status}`);
        return new Uint8Array(await r.arrayBuffer());
      }),
    ]).catch((e) => {
      assets = null; // allow a retry later
      throw e;
    });
  }
  return assets;
}

const options = (model, delegate) => ({
  baseOptions: { modelAssetBuffer: model, delegate },
  runningMode: "VIDEO",
  numFaces: 1,
  outputFaceBlendshapes: false, // not needed
  outputFacialTransformationMatrixes: false,
  // Defaults are 0.5. Real webcams (dim light, glasses, wide angle) often score 0.3-0.5 on a
  // perfectly visible face.
  minFaceDetectionConfidence: 0.3,
  minFacePresenceConfidence: 0.3,
  minTrackingConfidence: 0.3,
});

/**
 * Create a NEW FaceLandmarker. The caller owns it and must close() it.
 * Delegate: CPU (wasm + XNNPACK) unless the page URL has ?gpu=1. If GPU fails to initialize we
 * fall back to CPU.
 * @returns {Promise<{landmarker: FaceLandmarker, delegate: "CPU"|"GPU", initMs: number}>}
 */
export async function createLandmarker() {
  const t0 = performance.now();
  const [fileset, model] = await loadLandmarkerAssets();
  let delegate = preferredDelegate();
  let landmarker;
  try {
    landmarker = await FaceLandmarker.createFromOptions(fileset, options(model, delegate));
  } catch (e) {
    if (delegate === "CPU") throw e;
    console.warn("FaceLandmarker GPU delegate failed, using CPU", e);
    delegate = "CPU";
    landmarker = await FaceLandmarker.createFromOptions(fileset, options(model, delegate));
  }
  return { landmarker, delegate, initMs: Math.round(performance.now() - t0) };
}
