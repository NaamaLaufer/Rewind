// The measurement loop:
//   every 100 ms (10 fps): MediaPipe on the current camera frame -> 478x3 raw landmarks -> ring buffer
//   every 2 s: if the 100-frame window is full and a face is visible -> v4_7 -> score -> onScore()
// No face in >= 7 of the last 10 ticks -> noFace (the model does not run, nothing is sent).
// When the face returns we keep filling the same window (no reset) so a score comes back quickly.
//
// Robustness (see DECISIONS D-042):
// - exactly ONE detection loop at a time, even under React StrictMode's double mount
//   (module-level owner token: a loop that is no longer the owner stops itself);
// - strictly increasing timestamps for detectForVideo (shared by every caller of the singleton);
// - an exception from detectForVideo is an ERROR (logged + shown), never counted as "no face".
import { useEffect, useRef, useState } from "react";
import { FPS, INFER_EVERY_MS, LANDMARKS, NO_FACE_MIN, NO_FACE_TICKS, WINDOW } from "./config.js";
import { getLandmarker } from "./landmarker.js";
import { loadModel, runModel } from "./model.js";
import { unrollRing } from "./modelMath.js";
import { ema } from "./smoothing.js";

const FRAME = LANDMARKS * 3;

// Shared by every loop because the FaceLandmarker itself is a shared singleton:
// MediaPipe rejects a timestamp that is not larger than the previous one it saw.
let lastTs = 0;
function nextTimestamp() {
  lastTs = Math.max(performance.now(), lastTs + 1);
  return lastTs;
}

// Only the loop holding the current token may run; a newer loop takes over, older ones stop.
let loopOwner = 0;

const initial = {
  status: "idle", // idle | loading | running | error
  error: null,
  detectError: null, // MediaPipe threw while detecting (different from "no face")
  framesFilled: 0,
  noFace: false,
  paused: false,
  score: null,
  smoothed: null,
  level: null,
  attentionPeak: null,
  fps: null,
  detectMs: null,
};

/** Start downloading/initializing MediaPipe + the ONNX model early (e.g. while the consent card
 *  is shown), so the first score is not delayed by loading after the camera turns on. */
export function preloadFocusEngine() {
  getLandmarker().catch(() => {});
  loadModel().catch(() => {});
}

export function useFocusEngine({ videoRef, enabled, onScore }) {
  const [state, setState] = useState(initial);
  const onScoreRef = useRef(onScore);
  onScoreRef.current = onScore;

  useEffect(() => {
    if (!enabled) {
      setState(initial);
      return undefined;
    }
    const myToken = ++loopOwner;
    let cancelled = false;
    let tickTimer = null;
    let inferTimer = null;
    const ring = new Float32Array(WINDOW * FRAME);
    let next = 0;
    let filled = 0;
    const history = [];
    let noFace = false;
    let busy = false;
    let smoothed = null;
    let errorShown = false;

    const alive = () => !cancelled && loopOwner === myToken;
    const patch = (p) => alive() && setState((s) => ({ ...s, ...p }));
    const stop = () => {
      clearInterval(tickTimer);
      clearInterval(inferTimer);
      tickTimer = inferTimer = null;
    };
    // Diagnostics: real frames/second and ms per detection over the last ~2 seconds.
    const stamps = [];
    let detectMsAvg = null;

    function tick(landmarker) {
      if (!alive()) return stop();
      const video = videoRef.current;
      if (document.hidden || !video || video.readyState < 2 || video.videoWidth === 0) return;
      if (video.paused) {
        video.play().catch(() => {}); // only analyze the element that is actually playing
        return;
      }
      let result;
      const t0 = performance.now();
      try {
        result = landmarker.detectForVideo(video, nextTimestamp());
      } catch (e) {
        // NOT "no face": the detector failed. Log it and show a separate error.
        console.error("FaceLandmarker.detectForVideo failed", e);
        if (!errorShown) {
          errorShown = true;
          patch({ detectError: "זיהוי הפנים נכשל בדפדפן הזה. נסי לרענן את הדף או לבחור מצלמה אחרת." });
        }
        return;
      }
      if (errorShown) {
        errorShown = false;
        patch({ detectError: null });
      }
      const t1 = performance.now();
      detectMsAvg = detectMsAvg === null ? t1 - t0 : 0.9 * detectMsAvg + 0.1 * (t1 - t0);
      stamps.push(t1);
      while (stamps.length && t1 - stamps[0] > 2000) stamps.shift();

      const faces = result?.faceLandmarks ?? [];
      const face = faces.length > 0 ? faces[0] : null; // faceLandmarks.length > 0 = a face was found
      const hasFace = !!face && face.length >= LANDMARKS;
      history.push(hasFace);
      if (history.length > NO_FACE_TICKS) history.shift();

      if (hasFace) {
        const off = next * FRAME;
        for (let i = 0; i < LANDMARKS; i++) {
          const p = face[i];
          ring[off + i * 3] = p.x; // raw values: normalization happens inside the model
          ring[off + i * 3 + 1] = p.y;
          ring[off + i * 3 + 2] = p.z;
        }
        next = (next + 1) % WINDOW;
        if (filled < WINDOW) {
          filled += 1;
          patch({ framesFilled: filled });
          if (filled === WINDOW) setTimeout(infer, 0); // first score as soon as the window is full
        }
      }
      // noFace = MANY misses (>= 7 of the last 10 analyzed frames). A face sets it back to false.
      const misses = history.filter((h) => h === false).length;
      const nowNoFace = misses >= NO_FACE_MIN;
      if (nowNoFace !== noFace) {
        noFace = nowNoFace;
        patch({ noFace });
      }
    }

    const diag = () => ({
      fps: Math.round((stamps.length / 2) * 10) / 10,
      detectMs: detectMsAvg === null ? null : Math.round(detectMsAvg),
    });

    async function infer() {
      if (!alive()) return stop();
      if (filled < WINDOW) patch(diag()); // keep diagnostics fresh while the window fills
      if (busy || filled < WINDOW || noFace || document.hidden) return;
      busy = true;
      try {
        const frames = unrollRing(ring, next, WINDOW, FRAME);
        const r = await runModel(frames);
        if (!alive()) return;
        smoothed = ema(smoothed, r.score);
        patch({ score: r.score, smoothed, level: r.level, attentionPeak: r.attentionPeak, ...diag() });
        onScoreRef.current?.({ ...r, smoothed });
      } catch (e) {
        console.error("inference failed", e);
      } finally {
        busy = false;
      }
    }

    const onVisibility = () => patch({ paused: document.hidden });
    document.addEventListener("visibilitychange", onVisibility);

    setState({ ...initial, status: "loading", paused: document.hidden });
    Promise.all([getLandmarker(), loadModel()])
      .then(([landmarker]) => {
        if (!alive() || tickTimer) return; // a cleaned-up (StrictMode) effect never starts a loop
        patch({ status: "running" });
        tickTimer = setInterval(() => tick(landmarker), 1000 / FPS);
        inferTimer = setInterval(infer, INFER_EVERY_MS);
      })
      .catch((e) => {
        console.error(e);
        patch({ status: "error", error: "לא הצלחנו לטעון את מודל הריכוז. נסי לרענן את הדף." });
      });

    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, videoRef]);

  return state;
}
