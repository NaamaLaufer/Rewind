// MediaPipe FaceLandmarker (478 landmarks), loaded once from local files (no CDN at runtime).
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

let promise = null;

async function create() {
  const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
  const options = (delegate) => ({
    baseOptions: { modelAssetPath: "/mediapipe/face_landmarker.task", delegate },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
  });
  try {
    return await FaceLandmarker.createFromOptions(fileset, options("GPU"));
  } catch (e) {
    console.warn("FaceLandmarker GPU delegate failed, falling back to CPU", e);
    return FaceLandmarker.createFromOptions(fileset, options("CPU"));
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
