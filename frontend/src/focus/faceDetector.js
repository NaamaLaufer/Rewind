// DEBUG ONLY (?debug=1): MediaPipe FaceDetector (BlazeFace short range, the same detector family the
// FaceLandmarker uses internally). FaceLandmarker does not expose a confidence score; this does,
// so the debug panel can show "a face is there with confidence 0.42" vs "nothing found at all".
import { FaceDetector, FilesetResolver } from "@mediapipe/tasks-vision";

let promise = null;

export function getFaceDetector() {
  if (!promise) {
    promise = FilesetResolver.forVisionTasks("/mediapipe/wasm")
      .then((fileset) =>
        FaceDetector.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: "/mediapipe/blaze_face_short_range.tflite", delegate: "CPU" },
          runningMode: "IMAGE", // IMAGE mode: no timestamp bookkeeping, called only a few times/sec
          minDetectionConfidence: 0.2, // low enough to show a weak face (0.2-0.5); the panel counts >= 0.6 as a face
        }),
      )
      .catch((e) => {
        promise = null;
        throw e;
      });
  }
  return promise;
}
