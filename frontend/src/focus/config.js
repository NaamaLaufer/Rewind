// Change the model version in ONE place. The file must exist in public/models/.
export const MODEL_VERSION = "v4_7";
export const MODEL_URL = `/models/${MODEL_VERSION}.onnx`;

export const FPS = 10; // MediaPipe sampling rate (the model was trained at 10 fps)
export const WINDOW = 100; // frames per inference window (~10 s)
export const LANDMARKS = 478;
export const INFER_EVERY_MS = 2000; // run the model every 2 seconds
export const NO_FACE_TICKS = 10; // look at the last 10 ticks (~1 s)
export const NO_FACE_MIN = 7; // >= 7 of them without a face -> "no face"

// MediaPipe delegate. "?delegate=GPU" in the page URL overrides it (for experiments).
export function preferredDelegate() {
  try {
    const d = new URLSearchParams(window.location.search).get("delegate");
    if (d === "GPU" || d === "CPU") return d;
  } catch {
    /* not in a browser */
  }
  return "CPU";
}

const param = (name) => {
  try {
    return new URLSearchParams(window.location.search).get(name);
  } catch {
    return null;
  }
};

/** "?debug=1" in the page URL shows the camera/face debug panel. */
export const debugEnabled = () => param("debug") === "1";

/** "?input=canvas" feeds MediaPipe a 2D-canvas copy of the frame instead of the <video> element
 *  (diagnostic: rules out video->texture upload problems on some GPUs/drivers). */
export const inputMode = () => (param("input") === "canvas" ? "canvas" : "video");
