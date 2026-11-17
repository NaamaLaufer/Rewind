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
// Self-healing (D-049): every tick is wrapped in try/catch (the loop never dies); a paused camera
// <video> is play()ed again and frames that are not ready are NOT counted as "no face"; coming back
// to the tab resets the miss history and restarts the loop if needed; a lost WebGL context recreates
// the FaceLandmarker on CPU; a watchdog restarts loop + landmarker after 3 s without a result.
// Fast start (D-050): first face -> faceSeen; at 30 and 60 frames a PROVISIONAL score from the
// partial window (shown only: not sent, no alerts/debt/calibration). Only 100-frame windows count.
// Head pose / eyes (D-046): every face frame also feeds gaze.js. The first 100 face frames define
// the user's neutral pose; after that, looking away or eyes closed for > 4 s sets gaze.sustained.
import { useEffect, useRef, useState } from "react";
import { debugEnabled, FPS, INFER_EVERY_MS, inputMode, LANDMARKS, NO_FACE_MIN, NO_FACE_TICKS, WINDOW } from "./config.js";
import { getFaceDetector } from "./faceDetector.js";
import { classifyPose, headPose, initialGazeState, NEUTRAL_FRAMES, neutralPose, stepGaze } from "./gaze.js";
import { getLandmarker, landmarkerDelegate, resetLandmarker } from "./landmarker.js";
import { loadModel, runModel } from "./model.js";
import { unrollRing } from "./modelMath.js";
import { ema } from "./smoothing.js";

const FRAME = LANDMARKS * 3;
const WATCHDOG_MS = 3000; // no detection result for this long while the camera is on -> restart
const PROVISIONAL_AT = [30, 60]; // partial windows that give a provisional score
const NO_FACE_RESTART_MS = 5000; // faces seen before, none for 5 s -> one tracker reset
const STARTUP_NO_FACE_TICKS = 20; // before the first face: ~2 s of misses before warning "no face"

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
  faceSeen: false, // a face was detected at least once in this measurement
  provisional: false, // the shown score comes from a partial window (30/60 frames)
  restarts: 0, // self-healing restarts of the loop/landmarker
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
    // self-healing
    let landmarker = null;
    let watchTimer = null;
    let lastResultAt = performance.now();
    let restarting = false;
    let restarts = 0;
    let lastRestart = null;
    let consecutiveErrors = 0;
    let faceSeen = false;
    let failedRestarts = 0; // restarts since the last good result (backoff)
    let lastFaceAt = performance.now();
    let faceRestartDone = false; // one landmarker restart per long no-face episode
    let startupMisses = 0;
    let stallUntil = 0;
    const provisionalDone = new Set();
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
      clearInterval(watchTimer);
      tickTimer = inferTimer = debugTimer = watchTimer = null;
    };
    // Diagnostics: real frames/second and ms per detection over the last ~2 seconds.
    const stamps = [];
    let detectMsAvg = null;

    // The loop never dies: any exception inside a tick is logged and the next tick runs normally.
    function safeTick() {
      try {
        tick();
      } catch (e) {
        console.error("focus tick failed", e);
        noteError("tick", e);
      }
    }

    function tick() {
      if (!alive()) return stop();
      const video = videoRef.current;
      // Not ready / hidden: skip WITHOUT counting the frame as "no face" (nothing was analyzed).
      if (document.hidden || !landmarker || !video) return;
      if (stallUntil && performance.now() < stallUntil) return; // ?debug=1 test hook: frozen detector
      if (video.paused || video.ended) {
        // A paused preview would feed MediaPipe the same frozen frame: start it again instead.
        video.play().catch((e) => noteError("video.play", e));
        return;
      }
      if (video.readyState < 2 || video.videoWidth === 0) return;
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
        consecutiveErrors += 1;
        if (consecutiveErrors >= 10) restart("10 detection errors in a row"); // ~1 s of failures
        if (!errorShown) {
          errorShown = true;
          patch({ detectError: "זיהוי הפנים נכשל בדפדפן הזה. נסי לרענן את הדף או לבחור מצלמה אחרת." });
        }
        return;
      }
      consecutiveErrors = 0;
      if (errorShown) {
        errorShown = false;
        patch({ detectError: null });
      }
      const t1 = performance.now();
      lastResultAt = t1; // the watchdog only cares that MediaPipe keeps answering
      failedRestarts = 0;
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
        lastFaceAt = t1;
        faceRestartDone = false;
      }
      if (hasFace && !faceSeen) {
        faceSeen = true;
        patch({ faceSeen: true }); // show the "faces detected" check right away
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
          else if (PROVISIONAL_AT.includes(filled) && !provisionalDone.has(filled)) {
            provisionalDone.add(filled);
            const n = filled;
            setTimeout(() => inferProvisional(n), 0);
          }
        }
      }
      // noFace = MANY misses (>= 7 of the last 10 analyzed frames). A face sets it back to false.
      const misses = history.filter((h) => h === false).length;
      // While starting (no face seen yet) wait ~2 s of misses before warning: MediaPipe often
      // needs a few frames to lock on, and a flash of "no face" at the start is wrong.
      startupMisses = faceSeen ? 0 : startupMisses + (hasFace ? 0 : 1);
      const nowNoFace = faceSeen ? misses >= NO_FACE_MIN : startupMisses >= STARTUP_NO_FACE_TICKS;
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
        patch({ score: r.score, provisional: false, smoothed, level: r.level, attentionPeak: r.attentionPeak, ...diag() });
        onScoreRef.current?.({ ...r, smoothed, gaze: gazeView() });
      } catch (e) {
        console.error("inference failed", e);
        noteError("ONNX model", e);
      } finally {
        busy = false;
      }
    }

    // Provisional score from the first n frames (30 or 60). Display only: it is NOT passed to
    // onScore, so it is never sent to the server and never used for alerts, debt or calibration.
    async function inferProvisional(n) {
      if (!alive() || busy || filled >= WINDOW || noFace || document.hidden) return;
      busy = true;
      try {
        // While the window is not full yet, frames 0..filled-1 of the ring are already chronological.
        const frames = ring.slice(0, n * FRAME);
        const r = await runModel(frames, n);
        if (!alive() || filled >= WINDOW) return; // the real score won the race
        patch({ score: r.score, provisional: true, level: r.level, ...diag() });
      } catch (e) {
        console.error("provisional inference failed", e);
        noteError("ONNX model (provisional)", e);
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
          restarts,
          lastRestart,
          sinceResult: Math.round((now - lastResultAt) / 100) / 10,
          gazeFor: gazeState.since !== null ? Math.round((now - gazeState.since) / 100) / 10 : 0,
        },
      });
    }
    // ?debug=1 only: hooks for the self-healing E2E test (simulate a frozen detector / lost GPU).
    if (debugOn) {
      window.__focusDebug = {
        stall: (ms) => (stallUntil = performance.now() + ms),
        loseContext: () => {
          const c = document.createElement("canvas");
          document.body.appendChild(c);
          c.dispatchEvent(new Event("webglcontextlost"));
          c.remove();
        },
        stats: () => ({ restarts, lastRestart, filled, faceSeen, noFace, delegate: landmarkerDelegate() }),
      };
    }

    const onWindowError = (ev) => noteError("window", ev?.reason ?? ev?.error ?? ev?.message);
    if (debugOn) {
      window.addEventListener("error", onWindowError);
      window.addEventListener("unhandledrejection", onWindowError);
    }

    function startLoop(lm) {
      landmarker = lm;
      clearInterval(tickTimer);
      lastResultAt = performance.now();
      tickTimer = setInterval(safeTick, 1000 / FPS);
      if (!inferTimer) inferTimer = setInterval(infer, INFER_EVERY_MS);
      if (!watchTimer) watchTimer = setInterval(watchdog, 1000);
    }

    // Rebuild the landmarker and restart the tick loop. The ring buffer is kept, so the score
    // continues where it was instead of starting over.
    async function restart(reason, forceCPU = false) {
      if (restarting || !alive()) return;
      restarting = true;
      restarts += 1;
      lastRestart = `${new Date().toLocaleTimeString("he-IL")}: ${reason}`;
      console.warn("focus engine restart:", reason);
      clearInterval(tickTimer);
      tickTimer = null;
      landmarker = null;
      try {
        videoRef.current?.play?.().catch(() => {});
        const lm = await resetLandmarker({ forceCPU });
        if (!alive()) return;
        consecutiveErrors = 0;
        startLoop(lm);
        patch({ restarts });
      } catch (e) {
        console.error("landmarker restart failed", e);
        noteError("restart", e);
        lastResultAt = performance.now(); // the watchdog tries again in 3 s
      } finally {
        restarting = false;
      }
    }

    // Watchdog: camera on, tab visible, but MediaPipe has not answered for 3 s -> restart.
    function watchdog() {
      if (!alive() || restarting || document.hidden) return;
      const video = videoRef.current;
      if (!video || !video.srcObject) return; // camera not attached (nothing to analyze)
      if (video.paused) video.play().catch(() => {});
      const now = performance.now();
      // 3 s, then 6, 9... (max 30 s) while restarts do not help (e.g. the camera itself stalled)
      const limit = Math.min(WATCHDOG_MS * (1 + failedRestarts), 30_000);
      if (now - lastResultAt > limit) {
        failedRestarts += 1;
        restart(`no detection result for ${Math.round(limit / 1000)} s`);
      } else if (faceSeen && !faceRestartDone && now - lastResultAt < 1000 && now - lastFaceAt > NO_FACE_RESTART_MS) {
        // MediaPipe answers but has found no face for 5 s after it did find one: a stuck tracker
        // looks exactly like this. One fresh landmarker per episode is cheap; if the user really
        // left, nothing changes.
        faceRestartDone = true;
        restart("no face for 5 s after faces were seen (tracker reset)");
      }
    }

    const onVisibility = () => {
      patch({ paused: document.hidden });
      if (document.hidden || !alive()) return;
      // Back on the tab: forget the misses from before, give the watchdog a fresh 3 s, make sure
      // the preview plays and the loop runs.
      history.length = 0;
      lastResultAt = performance.now();
      lastFaceAt = performance.now();
      videoRef.current?.play?.().catch(() => {});
      if (!tickTimer && landmarker && !restarting) startLoop(landmarker);
    };
    document.addEventListener("visibilitychange", onVisibility);

    // A lost WebGL context kills a GPU-delegate landmarker: rebuild it on CPU. (webglcontextlost
    // does not bubble, so listen in the capture phase on window.)
    const onContextLost = (ev) => {
      noteError("webgl", "context lost");
      restart("WebGL context lost", true);
    };
    window.addEventListener("webglcontextlost", onContextLost, true);

    setState({ ...initial, status: "loading", paused: document.hidden });
    if (debugOn) debugTimer = setInterval(debugTick, 500); // runs even while the models load
    Promise.all([getLandmarker(), loadModel()])
      .then(([lm]) => {
        if (!alive() || tickTimer) return; // a cleaned-up (StrictMode) effect never starts a loop
        patch({ status: "running" });
        startLoop(lm);
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
      window.removeEventListener("webglcontextlost", onContextLost, true);
      if (debugOn) delete window.__focusDebug;
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("unhandledrejection", onWindowError);
    };
  }, [enabled, videoRef]);

  return state;
}
