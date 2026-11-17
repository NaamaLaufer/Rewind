// The measurement loop:
//   every 100 ms (10 fps): MediaPipe on the current camera frame -> 478x3 raw landmarks -> ring buffer
//   every 2 s: if the 100-frame window is full and a face is visible -> v4_7 -> score -> onScore()
// No face in >= 7 of the last 10 ticks -> noFace (the model does not run, nothing is sent).
// When the face returns we keep filling the same window (no reset) so a score comes back quickly.
import { useEffect, useRef, useState } from "react";
import { FPS, INFER_EVERY_MS, LANDMARKS, NO_FACE_MIN, NO_FACE_TICKS, WINDOW } from "./config.js";
import { getLandmarker } from "./landmarker.js";
import { loadModel, runModel } from "./model.js";
import { unrollRing } from "./modelMath.js";
import { ema } from "./smoothing.js";

const FRAME = LANDMARKS * 3;

const initial = {
  status: "idle", // idle | loading | running | error
  error: null,
  framesFilled: 0,
  noFace: false,
  paused: false,
  score: null,
  smoothed: null,
  level: null,
  attentionPeak: null,
};

export function useFocusEngine({ videoRef, enabled, onScore }) {
  const [state, setState] = useState(initial);
  const onScoreRef = useRef(onScore);
  onScoreRef.current = onScore;

  useEffect(() => {
    if (!enabled) {
      setState(initial);
      return undefined;
    }
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

    const patch = (p) => !cancelled && setState((s) => ({ ...s, ...p }));

    function tick(landmarker) {
      const video = videoRef.current;
      if (document.hidden || !video || video.readyState < 2 || video.videoWidth === 0) return;
      let result;
      try {
        result = landmarker.detectForVideo(video, performance.now());
      } catch {
        return;
      }
      const face = result?.faceLandmarks?.[0];
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
        }
      }
      const misses = history.filter((h) => !h).length;
      const nowNoFace = history.length >= NO_FACE_TICKS ? misses >= NO_FACE_MIN : misses >= NO_FACE_MIN;
      if (nowNoFace !== noFace) {
        noFace = nowNoFace;
        patch({ noFace });
      }
    }

    async function infer() {
      if (busy || filled < WINDOW || noFace || document.hidden) return;
      busy = true;
      try {
        const frames = unrollRing(ring, next, WINDOW, FRAME);
        const r = await runModel(frames);
        if (cancelled) return;
        smoothed = ema(smoothed, r.score);
        patch({ score: r.score, smoothed, level: r.level, attentionPeak: r.attentionPeak });
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
        if (cancelled) return;
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
      clearInterval(tickTimer);
      clearInterval(inferTimer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, videoRef]);

  return state;
}
