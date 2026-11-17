// MediaPipe FaceLandmarker (478 landmarks), loaded once from local files (no CDN at runtime).
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { preferredDelegate } from "./config.js";

let promise = null;

async function create() {
  const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
  const options = (delegate) => ({
    baseOptions: { modelAssetPath: "/mediapipe/face_landmarker.task", delegate },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFaceBlendshapes: false, // not needed
    outputFacialTransformationMatrixes: false,
    // Defaults are 0.5. Real webcams (dim light, glasses, wide angle) often score 0.3-0.5 on a
    // perfectly visible face, which would show "no face" although the preview shows one.
    minFaceDetectionConfidence: 0.3,
    minFacePresenceConfidence: 0.3,
    minTrackingConfidence: 0.3,
  });
  // CPU (wasm + XNNPACK) by default: predictable speed on every machine. GPU via WebGL is faster
  // on a real GPU but very slow on machines without one (software WebGL). If the preferred
  // delegate fails to initialize, fall back to the other one.
  const first = preferredDelegate();
  const second = first === "CPU" ? "GPU" : "CPU";
  try {
    return await FaceLandmarker.createFromOptions(fileset, options(first));
  } catch (e) {
    console.warn(`FaceLandmarker ${first} delegate failed, falling back to ${second}`, e);
    return FaceLandmarker.createFromOptions(fileset, options(second));
  }
}

/** Singleton: the first caller starts loading, everyone shares the same instance. */
export function getLandmarker() {
  if (!promise) {
    promise = create().catch((e) => {
      promise = null; // allow a retry later
      throw e;
    });
  }
  return promise;
}
