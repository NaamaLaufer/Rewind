// Change the model version in ONE place. The file must exist in public/models/.
export const MODEL_VERSION = "v4_7";
export const MODEL_URL = `/models/${MODEL_VERSION}.onnx`;

export const FPS = 10; // MediaPipe sampling rate (the model was trained at 10 fps)
export const WINDOW = 100; // frames per inference window (~10 s)
export const LANDMARKS = 478;
export const INFER_EVERY_MS = 2000; // run the model every 2 seconds
export const NO_FACE_TICKS = 10; // look at the last 10 ticks (~1 s)
export const NO_FACE_MIN = 7; // >= 7 of them without a face -> "no face"

const param = (name) => {
  try {
    return new URLSearchParams(window.location.search).get(name);
  } catch {
    return null;
  }
};

/** "?debug=1" in the page URL shows the camera/face debug panel. */
export const debugEnabled = () => param("debug") === "1";

/** MediaPipe delegate: CPU by default (D-051). "?gpu=1" uses the GPU (WebGL) delegate, for
 *  comparison only: on Windows it is known to sometimes return empty results without an error. */
export const preferredDelegate = () => (param("gpu") === "1" ? "GPU" : "CPU");

/** What MediaPipe receives (D-051). Default "image": a copy of the camera frame as ImageData (plain
 *  pixels we can check: size, brightness). "?input=video" hands MediaPipe the <video> element
 *  directly, which goes through the browser's video->WebGL texture path (for comparison). */
export const inputMode = () => (param("input") === "video" ? "video" : "image");
