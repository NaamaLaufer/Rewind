// The measurement loop:
//   every 100 ms (10 fps): copy the camera frame -> MediaPipe -> 478x3 raw landmarks -> ring buffer
//   every 2 s: if the 100-frame window is full and a face is visible -> v4_7 -> score -> onScore()
// No face in >= 7 of the last 10 analyzed frames -> noFace (the model does not run, nothing is sent).
// When the face returns we keep filling the same window (no reset) so a score comes back quickly.
//
// Startup (D-051), in this exact order, all owned by ONE effect run:
//   1. the engine attaches the camera stream to the ONE <video> element (videoRef) and waits for
//      'loadeddata', a resolved play() and videoWidth > 0;
//   2. in parallel it creates its OWN FaceLandmarker (never shared with another session) and loads
//      the ONNX model;
//   3. only when all three are ready does the 10 fps loop start.
// Stopping (end of session, leaving the page, camera off) clears the timers, closes this
// landmarker and detaches the stream. Nothing half-initialized survives into the next session.
//
// A frame is analyzed only when the camera track is live, the video plays and has a size. Frames
// that are skipped are NOT "no face" (nothing was analyzed). Before the first face, black frames
// (camera warming up) are skipped too. If detectForVideo throws, that FaceLandmarker is broken for
// good (measured), so we close it and create a new one (at most 3 times per measurement).
//
// Fast start (D-050): first face -> faceSeen; at 30 and 60 frames a PROVISIONAL score from the
// partial window (shown only: not sent, no alerts/debt/calibration). Only 100-frame windows count.
// Head pose / eyes (D-046): every face frame also feeds gaze.js.
import { useEffect, useRef, useState } from "react";
import { debugEnabled, FPS, INFER_EVERY_MS, inputMode, LANDMARKS, NO_FACE_MIN, NO_FACE_TICKS, WINDOW } from "./config.js";
import { getFaceDetector } from "./faceDetector.js";
import { classifyPose, headPose, initialGazeState, NEUTRAL_FRAMES, neutralPose, stepGaze } from "./gaze.js";
import { createLandmarker, loadLandmarkerAssets } from "./landmarker.js";
import { loadModel, runModel } from "./model.js";
import { unrollRing } from "./modelMath.js";
import { ema } from "./smoothing.js";

const FRAME = LANDMARKS * 3;
const PROVISIONAL_AT = [30, 60]; // partial windows that give a provisional score
const STARTUP_NO_FACE_TICKS = 20; // before the first face: ~2 s of misses before warning "no face"
const BLANK_LEVEL = 8; // mean brightness (0-255) below this = the camera sends a black picture
const BLANK_WARN_FRAMES = 30; // ~3 s of black pictures before any face -> tell the user
const MAX_RECREATE = 3; // new FaceLandmarker after a detection error, per measurement
const LAST_RESULTS = 20; // detection results kept for the diagnostics
// ?debug=1 FaceDetector: a candidate counts as a face from 0.75 (real faces score ~0.95; Chrome's
// synthetic no-face camera pattern reaches 0.62 on the copied frame).
const DETECTOR_FACE = 0.75;

const initial = {
  status: "idle", // idle | loading | running | error
  error: null,
  detectError: null, // MediaPipe threw while detecting (different from "no face")
  framesFilled: 0,
  noFace: false,
  blank: false, // the camera sends black pictures (before any face was seen)
  paused: false,
  score: null,
  smoothed: null,
  level: null,
  attentionPeak: null,
  fps: null,
  detectMs: null,
  faceSeen: false, // a face was detected at least once in this measurement
  provisional: false, // the shown score comes from a partial window (30/60 frames)
  gaze: { calibrated: false, episode: false, sustained: false, reason: null },
  debug: null, // only filled with ?debug=1
};

/** Start downloading the MediaPipe runtime/model bytes and the ONNX model early (e.g. while the
 *  consent card is shown). Only immutable assets are preloaded, never a landmarker instance. */
export function preloadFocusEngine() {
  loadLandmarkerAssets().catch(() => {});
  loadModel().catch(() => {});
}

// Diagnostics of the measurement that runs now (or ran last), for the "העתקת אבחון" button.
let currentDiagnostics = null;
export function focusDiagnostics() {
  const base = { generatedAt: new Date().toISOString(), userAgent: navigator.userAgent,
    page: window.location.pathname + window.location.search };
  return currentDiagnostics ? { ...base, ...currentDiagnostics() } : { ...base, engine: "המדידה לא הופעלה עדיין" };
}
if (typeof window !== "undefined") window.__focusDiagnostics = focusDiagnostics;

/** Resolve on the first of `names` fired by `target`; reject with AbortError when `signal` aborts. */
function nextEvent(target, names, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException("stopped", "AbortError"));
    const off = () => {
      names.forEach((n) => target.removeEventListener(n, done));
      signal.removeEventListener("abort", abort);
    };
    const done = () => {
      off();
      resolve();
    };
    const abort = () => {
      off();
      reject(new DOMException("stopped", "AbortError"));
    };
    names.forEach((n) => target.addEventListener(n, done));
    signal.addEventListener("abort", abort);
  });
}

/** Attach the stream to the video element and wait until it really shows frames:
 *  'loadeddata' fired, play() resolved, and the frame size is known. */
async function startVideo(video, stream, signal, noteError) {
  if (video.srcObject !== stream) video.srcObject = stream;
  while (video.readyState < 2) await nextEvent(video, ["loadeddata"], signal);
  try {
    await video.play();
  } catch (e) {
    noteError("video.play", e);
  }
  while (video.paused) {
    video.play().catch(() => {});
    await nextEvent(video, ["playing"], signal);
  }
  while (video.videoWidth === 0) await nextEvent(video, ["resize", "timeupdate"], signal);
}

export function useFocusEngine({ videoRef, stream, onScore }) {
  const [state, setState] = useState(initial);
  const onScoreRef = useRef(onScore);
  onScoreRef.current = onScore;

  useEffect(() => {
    if (!stream) {
      setState(initial);
      return undefined;
    }
    // The ONE element that shows the camera. Captured once: this effect run owns it until cleanup.
    const video = videoRef.current;
    if (!video) {
      setState({ ...initial, status: "error", error: "תצוגת המצלמה לא נמצאה בעמוד. נסי לרענן את הדף." });
      return undefined;
    }
    let cancelled = false;
    const ac = new AbortController();
    const t0 = performance.now();
    const since = () => Math.round(performance.now() - t0);
    const mode = inputMode();
    const debugOn = debugEnabled();

    let landmarker = null;
    let recreating = false;
    let recreations = 0;
    let tickTimer = null;
    let inferTimer = null;
    let debugTimer = null;
    let lastTs = 0; // detectForVideo needs strictly increasing timestamps
    const ring = new Float32Array(WINDOW * FRAME);
    let next = 0;
    let filled = 0;
    const history = [];
    let noFace = false;
    let busy = false;
    let smoothed = null;
    let faceSeen = false;
    let startupMisses = 0;
    let blankRun = 0;
    let blank = false;
    let errorShown = false;
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

    // ---- diagnostics (always collected, cheap; shown/copied with ?debug=1) ----
    const diag = {
      delegate: null,
      landmarkerInitMs: null,
      timingsMs: { videoReady: null, landmarkerReady: null, modelReady: null, loopStarted: null, firstFrame: null, firstFace: null },
      framesAnalyzed: 0,
      facesFound: 0,
      skipped: { hidden: 0, trackNotLive: 0, videoPaused: 0, videoNotReady: 0, blankBeforeFace: 0 },
      detectMsAvg: null,
      copyMsAvg: null,
      lastBrightness: null,
      last: [],
      errors: [],
    };
    const noteError = (where, e) => {
      diag.errors.push({ atMs: since(), error: `${where}: ${String(e?.message ?? e).slice(0, 200)}` });
      if (diag.errors.length > 10) diag.errors.shift();
    };
    const avg = (prev, x) => (prev === null ? x : 0.9 * prev + 0.1 * x);
    const round1 = (x) => (x === null ? null : Math.round(x * 10) / 10);
    currentDiagnostics = () => {
      const track = stream.getVideoTracks()[0];
      const st = track?.getSettings?.() ?? {};
      return {
        camera: track ? { label: track.label, readyState: track.readyState, muted: track.muted, enabled: track.enabled,
          width: st.width ?? null, height: st.height ?? null, frameRate: st.frameRate ?? null } : null,
        delegate: diag.delegate,
        input: mode,
        landmarkerInitMs: diag.landmarkerInitMs,
        timingsMs: diag.timingsMs, // from the moment the camera stream was handed to the engine
        video: { readyState: video.readyState, paused: video.paused, ended: video.ended, videoWidth: video.videoWidth,
          videoHeight: video.videoHeight, streamAttached: video.srcObject === stream, inDocument: video.isConnected },
        engine: { stopped: cancelled, loopRunning: !!tickTimer, landmarkerReady: !!landmarker, framesFilled: filled,
          faceSeen, noFace, blank },
        framesAnalyzed: diag.framesAnalyzed,
        facesFound: diag.facesFound,
        skipped: diag.skipped,
        detectMsAvg: round1(diag.detectMsAvg),
        copyMsAvg: round1(diag.copyMsAvg),
        lastBrightness: diag.lastBrightness,
        lastResults: diag.last,
        recreations,
        lastErrors: diag.errors,
      };
    };

    const patch = (p) => !cancelled && setState((s) => ({ ...s, ...p }));
    const publishGaze = () => {
      const g = gazeView();
      const key = `${g.calibrated}|${g.episode}|${g.sustained}|${g.reason}`;
      if (key !== gazeKey) {
        gazeKey = key;
        patch({ gaze: g });
      }
    };
    const stamps = []; // analyzed frames in the last ~2 s (fps diagnostics)

    // ---- the frame MediaPipe gets: an ImageData copy (default) or the <video> element ----
    const copyCanvas = document.createElement("canvas");
    let copyCtx = null;
    let lastInput = null;
    function grabFrame() {
      if (mode === "video") return { input: video, brightness: null };
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!copyCtx || copyCanvas.width !== w || copyCanvas.height !== h) {
        copyCanvas.width = w;
        copyCanvas.height = h;
        copyCtx = copyCanvas.getContext("2d", { willReadFrequently: true });
      }
      copyCtx.drawImage(video, 0, 0, w, h);
      const img = copyCtx.getImageData(0, 0, w, h);
      // mean brightness from a sample of the pixels (every 101st pixel is plenty)
      const px = img.data;
      let sum = 0;
      let n = 0;
      for (let i = 0; i < px.length; i += 4 * 101) {
        sum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
        n += 1;
      }
      return { input: img, brightness: Math.round(sum / n) };
    }

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
      if (cancelled || !landmarker) return;
      // Skipped frames are NOT "no face": nothing was analyzed.
      if (document.hidden) return void diag.skipped.hidden++;
      const track = stream.getVideoTracks()[0];
      // A stopped track keeps readyState 4 and gives black frames with NO error (measured).
      if (!track || track.readyState !== "live") return void diag.skipped.trackNotLive++;
      if (video.paused || video.ended) {
        diag.skipped.videoPaused++;
        video.play().catch((e) => noteError("video.play", e)); // a paused preview = a frozen frame
        return;
      }
      // An unready frame would break the FaceLandmarker for good (measured): never send one.
      if (video.readyState < 2 || video.videoWidth === 0) return void diag.skipped.videoNotReady++;

      const tA = performance.now();
      const frame = grabFrame();
      const tB = performance.now();
      if (diag.timingsMs.firstFrame === null) diag.timingsMs.firstFrame = since();
      diag.lastBrightness = frame.brightness;
      if (mode === "image") diag.copyMsAvg = avg(diag.copyMsAvg, tB - tA);
      // Camera still warming up: a black picture before any face is not "no face".
      if (!faceSeen && frame.brightness !== null && frame.brightness < BLANK_LEVEL) {
        diag.skipped.blankBeforeFace++;
        blankRun += 1;
        if (blankRun >= BLANK_WARN_FRAMES && !blank) {
          blank = true;
          patch({ blank: true });
        }
        return;
      }
      blankRun = 0;
      if (blank) {
        blank = false;
        patch({ blank: false });
      }

      let result;
      try {
        lastTs = Math.max(performance.now(), lastTs + 1);
        result = landmarker.detectForVideo(frame.input, lastTs);
      } catch (e) {
        // NOT "no face": the detector failed, and this instance will keep failing. Replace it.
        console.error("FaceLandmarker.detectForVideo failed", e);
        noteError("detectForVideo", e);
        recreate();
        return;
      }
      lastInput = frame.input;
      if (errorShown) {
        errorShown = false;
        patch({ detectError: null });
      }
      const t1 = performance.now();
      diag.framesAnalyzed += 1;
      diag.detectMsAvg = avg(diag.detectMsAvg, t1 - tB);
      stamps.push(t1);
      while (stamps.length && t1 - stamps[0] > 2000) stamps.shift();

      const faces = result?.faceLandmarks ?? [];
      const face = faces.length > 0 ? faces[0] : null;
      const hasFace = !!face && face.length >= LANDMARKS;
      diag.last.push({ atMs: since(), face: hasFace, ms: Math.round(t1 - tB) });
      if (diag.last.length > LAST_RESULTS) diag.last.shift();
      if (hasFace) {
        diag.facesFound += 1;
        if (diag.timingsMs.firstFace === null) diag.timingsMs.firstFace = since();
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
      // Before the first face: ~2 s of misses (MediaPipe needs a few frames to lock on).
      const misses = history.filter((h) => h === false).length;
      startupMisses = faceSeen ? 0 : startupMisses + (hasFace ? 0 : 1);
      const nowNoFace = faceSeen ? misses >= NO_FACE_MIN : startupMisses >= STARTUP_NO_FACE_TICKS;
      if (nowNoFace !== noFace) {
        noFace = nowNoFace;
        patch({ noFace });
        if (noFace) gazeState = initialGazeState(); // no face is handled separately (D-047)
      }
      publishGaze();
    }

    // A FaceLandmarker whose detectForVideo threw keeps throwing on every later frame (measured),
    // so the only fix is a new instance. Bounded: after MAX_RECREATE we show an error instead.
    async function recreate() {
      if (recreating || cancelled) return;
      const old = landmarker;
      landmarker = null; // ticks skip until the new one is ready
      try {
        old?.close();
      } catch {
        /* already broken */
      }
      if (recreations >= MAX_RECREATE) {
        patch({ status: "error", error: "זיהוי הפנים נכשל שוב ושוב בדפדפן הזה. נסי לרענן את הדף או לבחור מצלמה אחרת." });
        return;
      }
      recreating = true;
      recreations += 1;
      if (!errorShown) {
        errorShown = true;
        patch({ detectError: "זיהוי הפנים נתקל בשגיאה, מאתחלת אותו מחדש..." });
      }
      try {
        const c = await createLandmarker();
        if (cancelled) return c.landmarker.close();
        landmarker = c.landmarker;
      } catch (e) {
        console.error("FaceLandmarker re-create failed", e);
        noteError("recreate", e);
        patch({ status: "error", error: "לא הצלחנו לאתחל מחדש את זיהוי הפנים. נסי לרענן את הדף." });
      } finally {
        recreating = false;
      }
    }

    const fpsDiag = () => ({
      fps: Math.round((stamps.length / 2) * 10) / 10,
      detectMs: diag.detectMsAvg === null ? null : Math.round(diag.detectMsAvg),
    });

    async function infer() {
      if (cancelled) return;
      if (filled < WINDOW) patch(fpsDiag()); // keep diagnostics fresh while the window fills
      if (busy || filled < WINDOW || noFace || document.hidden) return;
      busy = true;
      try {
        const frames = unrollRing(ring, next, WINDOW, FRAME);
        const r = await runModel(frames);
        if (cancelled) return;
        smoothed = ema(smoothed, r.score);
        patch({ score: r.score, provisional: false, smoothed, level: r.level, attentionPeak: r.attentionPeak, ...fpsDiag() });
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
      if (cancelled || busy || filled >= WINDOW || noFace || document.hidden) return;
      busy = true;
      try {
        // While the window is not full yet, frames 0..filled-1 of the ring are already chronological.
        const frames = ring.slice(0, n * FRAME);
        const r = await runModel(frames, n);
        if (cancelled || filled >= WINDOW) return; // the real score won the race
        patch({ score: r.score, provisional: true, level: r.level, ...fpsDiag() });
      } catch (e) {
        console.error("provisional inference failed", e);
        noteError("ONNX model (provisional)", e);
      } finally {
        busy = false;
      }
    }

    // ---- ?debug=1: a second opinion (FaceDetector confidence) + live numbers for the panel ----
    let detector = null;
    if (debugOn) getFaceDetector().then((d) => (detector = d)).catch((e) => noteError("FaceDetector load", e));
    const dbg = { detectorScore: null, detectorFaces: null };
    function debugTick() {
      if (cancelled) return;
      const now = performance.now();
      // The detector looks at exactly the frame MediaPipe got last (never at an unready video).
      if (detector && lastInput) {
        try {
          const det = detector.detect(lastInput).detections ?? [];
          const scores = det.map((d) => d.categories?.[0]?.score ?? 0);
          dbg.detectorFaces = scores.filter((x) => x >= DETECTOR_FACE).length;
          dbg.detectorScore = scores.length ? Math.max(...scores) : 0;
        } catch (e) {
          noteError("FaceDetector", e);
        }
      }
      const lastErr = diag.errors[diag.errors.length - 1];
      patch({
        debug: {
          framesPerSec: stamps.filter((t) => now - t <= 1000).length,
          facesPerSec: diag.last.filter((r) => r.face && since() - r.atMs <= 1000).length,
          landmarkFaces: diag.last.length ? Number(diag.last[diag.last.length - 1].face) : null,
          detectorScore: dbg.detectorScore,
          detectorFaces: dbg.detectorFaces,
          detectorReady: !!detector,
          brightness: diag.lastBrightness,
          videoSize: `${video.videoWidth}×${video.videoHeight}`,
          readyState: video.readyState,
          paused: video.paused,
          delegate: diag.delegate,
          input: mode,
          ticks: diag.framesAnalyzed,
          facesFound: diag.facesFound,
          detectMs: diag.detectMsAvg === null ? null : Math.round(diag.detectMsAvg),
          copyMs: round1(diag.copyMsAvg),
          landmarkerInitMs: diag.landmarkerInitMs,
          lastError: lastErr?.error ?? null,
          lastErrorAt: lastErr ? `${(lastErr.atMs / 1000).toFixed(1)} שנ'` : null,
          yaw: lastPose ? Math.round(lastPose.yaw) : null,
          pitch: lastPose ? Math.round(lastPose.pitch) : null,
          ear: lastPose?.ear != null ? Math.round(lastPose.ear * 100) / 100 : null,
          neutral: neutral ? { yaw: Math.round(neutral.yaw), pitch: Math.round(neutral.pitch),
            ear: neutral.ear != null ? Math.round(neutral.ear * 100) / 100 : null } : null,
          neutralProgress: Math.min(poseSamples.length, NEUTRAL_FRAMES),
          lookingAway: !!lastCls?.away,
          eyesClosed: !!lastCls?.closed,
          recreations,
          gazeFor: gazeState.since !== null ? Math.round((now - gazeState.since) / 100) / 10 : 0,
        },
      });
    }

    // Hidden tab: ticks skip (and say so). Back on the tab: forget the misses from before.
    const onVisibility = () => {
      patch({ paused: document.hidden });
      if (document.hidden) return;
      history.length = 0;
      if (video.paused) video.play().catch((e) => noteError("video.play", e));
    };
    document.addEventListener("visibilitychange", onVisibility);

    // ---- startup: video ready + own landmarker + model, THEN the loop ----
    setState({ ...initial, status: "loading", paused: document.hidden });
    if (debugOn) debugTimer = setInterval(debugTick, 500); // runs even while loading
    const videoReady = startVideo(video, stream, ac.signal, noteError).then(() => {
      diag.timingsMs.videoReady = since();
    });
    const landmarkerReady = createLandmarker().then((c) => {
      if (cancelled) return c.landmarker.close(); // stopped while it was being created
      landmarker = c.landmarker;
      diag.delegate = c.delegate;
      diag.landmarkerInitMs = c.initMs;
      diag.timingsMs.landmarkerReady = since();
    });
    const modelReady = loadModel().then(() => {
      diag.timingsMs.modelReady = since();
    });
    Promise.all([videoReady, landmarkerReady, modelReady])
      .then(() => {
        if (cancelled) return;
        diag.timingsMs.loopStarted = since();
        patch({ status: "running" });
        tickTimer = setInterval(safeTick, 1000 / FPS);
        inferTimer = setInterval(infer, INFER_EVERY_MS);
      })
      .catch((e) => {
        if (cancelled || e?.name === "AbortError") return;
        console.error("focus engine start failed", e);
        noteError("start", e);
        patch({ status: "error", error: "לא הצלחנו להפעיל את מדידת הריכוז. נסי לרענן את הדף." });
      });

    return () => {
      cancelled = true;
      ac.abort();
      clearInterval(tickTimer);
      clearInterval(inferTimer);
      clearInterval(debugTimer);
      tickTimer = inferTimer = debugTimer = null;
      document.removeEventListener("visibilitychange", onVisibility);
      if (landmarker) {
        try {
          landmarker.close();
        } catch {
          /* already broken */
        }
        landmarker = null;
      }
      if (video.srcObject === stream) video.srcObject = null;
    };
  }, [stream, videoRef]);

  return state;
}
