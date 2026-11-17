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
// Head pose / eyes (D-046): every face frame also feeds gaze.js. The first 100 face frames define
// the user's neutral pose; after that, looking away or eyes closed for > 4 s sets gaze.sustained.
import { useEffect, useRef, useState } from "react";
import { debugEnabled, FPS, INFER_EVERY_MS, inputMode, LANDMARKS, NO_FACE_MIN, NO_FACE_TICKS, WINDOW } from "./config.js";
import { getFaceDetector } from "./faceDetector.js";
import { classifyPose, headPose, initialGazeState, NEUTRAL_FRAMES, neutralPose, stepGaze } from "./gaze.js";
import { getLandmarker, landmarkerDelegate } from "./landmarker.js";
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
  gaze: { calibrated: false, episode: false, sustained: false, reason: null },
  debug: null, // only filled with ?debug=1
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
    // head pose / eyes
    const poseSamples = [];
    let neutral = null;
    let gazeState = initialGazeState();
    let lastPose = null;
    let lastCls = null;
    const gazeView = () => ({ calibrated: !!neutral, episode: gazeState.since !== null,
      sustained: gazeState.sustained, reason: gazeState.reason });
    let gazeKey = "";
    const publishGaze = () => {
      const g = gazeView();
      const key = `${g.calibrated}|${g.episode}|${g.sustained}|${g.reason}`;
      if (key !== gazeKey) {
        gazeKey = key;
        patch({ gaze: g });
      }
    };

    // ---- ?debug=1 diagnostics (see DebugPanel) ----
    const debugOn = debugEnabled();
    const mode = inputMode();
    const dbg = { faceStamps: [], landmarkFaces: 0, detectorScore: null, detectorFaces: null,
      brightness: null, lastError: null, lastErrorAt: null, ticks: 0 };
    const noteError = (where, e) => {
      dbg.lastError = `${where}: ${String(e?.message ?? e).slice(0, 160)}`;
      dbg.lastErrorAt = new Date().toLocaleTimeString("he-IL");
    };
    let detector = null;
    let debugTimer = null;
    const frameCanvas = mode === "canvas" ? document.createElement("canvas") : null;
    const small = debugOn ? document.createElement("canvas") : null;
    if (small) {
      small.width = 32;
      small.height = 24;
    }
    if (debugOn) getFaceDetector().then((d) => (detector = d)).catch((e) => noteError("FaceDetector load", e));

    const alive = () => !cancelled && loopOwner === myToken;
    const patch = (p) => alive() && setState((s) => ({ ...s, ...p }));
    const stop = () => {
      clearInterval(tickTimer);
      clearInterval(inferTimer);
      clearInterval(debugTimer);
      tickTimer = inferTimer = debugTimer = null;
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
        let input = video;
        if (frameCanvas) {
          // ?input=canvas: hand MediaPipe a plain 2D-canvas copy of the frame
          if (frameCanvas.width !== video.videoWidth || frameCanvas.height !== video.videoHeight) {
            frameCanvas.width = video.videoWidth;
            frameCanvas.height = video.videoHeight;
          }
          frameCanvas.getContext("2d").drawImage(video, 0, 0);
          input = frameCanvas;
        }
        result = landmarker.detectForVideo(input, nextTimestamp());
      } catch (e) {
        // NOT "no face": the detector failed. Log it and show a separate error.
        console.error("FaceLandmarker.detectForVideo failed", e);
        noteError("detectForVideo", e);
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
      if (debugOn) {
        dbg.ticks += 1;
        dbg.landmarkFaces = faces.length;
        if (hasFace) dbg.faceStamps.push(t1);
        while (dbg.faceStamps.length && t1 - dbg.faceStamps[0] > 1000) dbg.faceStamps.shift();
      }
      if (hasFace) {
        const pose = headPose(face, video.videoWidth / video.videoHeight);
        lastPose = pose;
        if (!neutral && pose) {
          poseSamples.push(pose);
          if (poseSamples.length >= NEUTRAL_FRAMES) neutral = neutralPose(poseSamples);
        }
        lastCls = classifyPose(pose, neutral);
        gazeState = stepGaze(gazeState, lastCls, t1);
      } else {
        lastCls = null;
      }
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
        if (noFace) gazeState = initialGazeState(); // no face is handled separately (D-047)
      }
      publishGaze();
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
        onScoreRef.current?.({ ...r, smoothed, gaze: gazeView() });
      } catch (e) {
        console.error("inference failed", e);
        noteError("ONNX model", e);
      } finally {
        busy = false;
      }
    }

    // Every 500 ms in debug mode: detector confidence, frame brightness, rates -> state.debug
    function debugTick() {
      if (!alive()) return;
      const video = videoRef.current;
      const now = performance.now();
      if (video && video.readyState >= 2 && video.videoWidth > 0) {
        try {
          const ctx = small.getContext("2d", { willReadFrequently: true });
          ctx.drawImage(video, 0, 0, small.width, small.height);
          const px = ctx.getImageData(0, 0, small.width, small.height).data;
          let sum = 0;
          for (let i = 0; i < px.length; i += 4) sum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
          dbg.brightness = Math.round(sum / (px.length / 4));
        } catch (e) {
          noteError("brightness", e);
        }
        if (detector) {
          try {
            const det = detector.detect(video).detections ?? [];
            const scores = det.map((d) => d.categories?.[0]?.score ?? 0);
            dbg.detectorFaces = scores.filter((x) => x >= 0.6).length; // weak candidates are not "faces" (the no-face test pattern reaches 0.53)
            dbg.detectorScore = scores.length ? Math.max(...scores) : 0; // best candidate, even if weak
          } catch (e) {
            noteError("FaceDetector", e);
          }
        }
      }
      patch({
        debug: {
          framesPerSec: stamps.filter((t) => now - t <= 1000).length,
          facesPerSec: dbg.faceStamps.filter((t) => now - t <= 1000).length,
          landmarkFaces: dbg.landmarkFaces,
          detectorScore: dbg.detectorScore,
          detectorFaces: dbg.detectorFaces,
          detectorReady: !!detector,
          brightness: dbg.brightness,
          videoSize: video ? `${video.videoWidth}×${video.videoHeight}` : "—",
          readyState: video?.readyState ?? null,
          paused: video?.paused ?? null,
          delegate: landmarkerDelegate(),
          input: mode,
          ticks: dbg.ticks,
          detectMs: detectMsAvg === null ? null : Math.round(detectMsAvg),
          lastError: dbg.lastError,
          lastErrorAt: dbg.lastErrorAt,
          yaw: lastPose ? Math.round(lastPose.yaw) : null,
          pitch: lastPose ? Math.round(lastPose.pitch) : null,
          ear: lastPose?.ear != null ? Math.round(lastPose.ear * 100) / 100 : null,
          neutral: neutral ? { yaw: Math.round(neutral.yaw), pitch: Math.round(neutral.pitch),
            ear: neutral.ear != null ? Math.round(neutral.ear * 100) / 100 : null } : null,
          neutralProgress: Math.min(poseSamples.length, NEUTRAL_FRAMES),
          lookingAway: !!lastCls?.away,
          eyesClosed: !!lastCls?.closed,
          gazeFor: gazeState.since !== null ? Math.round((now - gazeState.since) / 100) / 10 : 0,
        },
      });
    }
    const onWindowError = (ev) => noteError("window", ev?.reason ?? ev?.error ?? ev?.message);
    if (debugOn) {
      window.addEventListener("error", onWindowError);
      window.addEventListener("unhandledrejection", onWindowError);
    }

    const onVisibility = () => patch({ paused: document.hidden });
    document.addEventListener("visibilitychange", onVisibility);

    setState({ ...initial, status: "loading", paused: document.hidden });
    if (debugOn) debugTimer = setInterval(debugTick, 500); // runs even while the models load
    Promise.all([getLandmarker(), loadModel()])
      .then(([landmarker]) => {
        if (!alive() || tickTimer) return; // a cleaned-up (StrictMode) effect never starts a loop
        patch({ status: "running" });
        tickTimer = setInterval(() => tick(landmarker), 1000 / FPS);
        inferTimer = setInterval(infer, INFER_EVERY_MS);
      })
      .catch((e) => {
        console.error(e);
        noteError("load", e);
        if (debugOn) debugTick();
        patch({ status: "error", error: "לא הצלחנו לטעון את מודל הריכוז. נסי לרענן את הדף." });
      });

    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("unhandledrejection", onWindowError);
    };
  }, [enabled, videoRef]);

  return state;
}
