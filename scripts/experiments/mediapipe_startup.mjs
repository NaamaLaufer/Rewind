// D-051: experiments on MediaPipe FaceLandmarker behaviour in Chromium (fake camera = face.y4m).
// Needs the dev stack on :3000 (serves /mediapipe/*). Run from the repo root:
//   node scripts/experiments/mediapipe_startup.mjs [all|close|contexts|black|videostates|ended|timing]
// Findings: an unready video frame breaks a FaceLandmarker for good; a closed one throws; a stopped
// track gives 0 faces with NO error; init ~0.8-1.6 s; video / canvas / ImageData input cost the same.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url)).replaceAll("\\", "/").replace(/\/$/, "");
const require = createRequire(`${ROOT}/e2e/package.json`);
const { chromium } = require("playwright");
const face = `${ROOT}/e2e/fixtures/face.y4m`;
const bundle = readFileSync(`${ROOT}/frontend/node_modules/@mediapipe/tasks-vision/vision_bundle.mjs`);
const which = process.argv[2] ?? "all";

const browser = await chromium.launch({
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-video-capture=${face}`,
    "--autoplay-policy=no-user-gesture-required"],
});
const ctx = await browser.newContext({ permissions: ["camera"] });
const page = await ctx.newPage();
page.on("console", (m) => { const t = m.text(); if (!/XNNPACK|odml|Content Security|Fetch API/.test(t)) console.log("[page]", t); });
await page.route("**/__tv.mjs", (r) => r.fulfill({ body: bundle, contentType: "text/javascript" }));
await page.goto("http://localhost:3000/about");

const out = await page.evaluate(async (which) => {
  const tv = await import("/__tv.mjs");
  const { FaceLandmarker, FilesetResolver } = tv;
  const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
  const make = (delegate = "CPU") => FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: "/mediapipe/face_landmarker.task", delegate },
    runningMode: "VIDEO", numFaces: 1,
    minFaceDetectionConfidence: 0.3, minFacePresenceConfidence: 0.3, minTrackingConfidence: 0.3,
  });
  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
  const video = document.createElement("video");
  video.muted = true; video.playsInline = true; video.srcObject = stream;
  document.body.appendChild(video);
  await video.play();
  while (video.videoWidth === 0) await new Promise((r) => setTimeout(r, 20));
  let ts = 0;
  const T = () => (ts = Math.max(performance.now(), ts + 1));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const run = async (lm, n, src = video) => {
    let faces = 0, errs = 0, err = null;
    for (let i = 0; i < n; i++) {
      try { if (lm.detectForVideo(src, T()).faceLandmarks.length) faces++; } catch (e) { errs++; err = String(e).slice(0, 120); }
      await sleep(100);
    }
    return { faces, of: n, errs, err };
  };
  const R = {};

  if (which === "all" || which === "close") {
    const a = await make();
    R.fresh = await run(a, 10);
    a.close();
    R.afterClose = await run(a, 10);
  }

  if (which === "all" || which === "contexts") {
    // keep one landmarker, create (and close) many others: does the first one keep working?
    const first = await make();
    R.firstBefore = await run(first, 5);
    let lost = 0;
    const others = [];
    for (let i = 0; i < 20; i++) {
      const o = await make();
      await run(o, 1);
      others.push(o);
      o.close(); // closed like resetLandmarker() does
    }
    R.firstAfter20ClosedOthers = await run(first, 10);
    const keep = [];
    for (let i = 0; i < 20; i++) { const o = await make(); await run(o, 1); keep.push(o); }
    R.firstAfter20OpenOthers = await run(first, 10);
    R.lastOpen = await run(keep[keep.length - 1], 10);
  }

  if (which === "all" || which === "black") {
    // a camera that delivers black frames first (warm-up), then the face
    const c = document.createElement("canvas"); c.width = 640; c.height = 480;
    const g = c.getContext("2d");
    const lm = await make();
    let res = [];
    for (let i = 0; i < 30; i++) {
      if (i < 15) { g.fillStyle = "#000"; g.fillRect(0, 0, 640, 480); } else g.drawImage(video, 0, 0, 640, 480);
      try { res.push(lm.detectForVideo(c, T()).faceLandmarks.length ? 1 : 0); } catch (e) { res.push("E"); }
      await sleep(100);
    }
    R.blackThenFace = res.join("");
    // resolution change mid stream (640x480 -> 1280x720 -> 320x240)
    res = [];
    for (const [w, h] of [[640, 480], [1280, 720], [320, 240], [640, 480]]) {
      c.width = w; c.height = h;
      for (let i = 0; i < 8; i++) { c.getContext("2d").drawImage(video, 0, 0, w, h);
        try { res.push(lm.detectForVideo(c, T()).faceLandmarks.length ? 1 : 0); } catch (e) { res.push("E"); }
        await sleep(100); }
      res.push("|");
    }
    R.resolutionChange = res.join("");
  }

  if (which === "all" || which === "videostates") {
    const lm = await make();
    // a video element whose stream is not attached yet / not playing
    const v2 = document.createElement("video"); v2.muted = true; document.body.appendChild(v2);
    let r1;
    try { r1 = lm.detectForVideo(v2, T()).faceLandmarks.length; } catch (e) { r1 = "throws: " + String(e).slice(0, 100); }
    R.emptyVideoElement = r1;
    v2.srcObject = stream; // attached but not yet loaded
    try { r1 = lm.detectForVideo(v2, T()).faceLandmarks.length; } catch (e) { r1 = "throws: " + String(e).slice(0, 100); }
    R.notLoadedVideo = r1;
    R.afterBadInputs = await run(lm, 10);
    await v2.play();
    while (v2.videoWidth === 0) await sleep(20);
    R.v2AfterPlay = await run(lm, 10, v2);
  }
  if (which === "ended") {
    const lm = await make();
    R.before = await run(lm, 5);
    stream.getTracks().forEach((t) => t.stop());
    await sleep(50);
    R.state = { rs: video.readyState, w: video.videoWidth, paused: video.paused, ended: video.ended };
    R.onStoppedTrack = await run(lm, 5);
    const s2 = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
    video.srcObject = s2; await video.play();
    while (video.readyState < 2) await sleep(20);
    R.afterNewStream = await run(lm, 10);
  }
  if (which === "readystate1") {
    // HAVE_METADATA: width known but no frame yet
    const lm = await make();
    const s2 = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
    const v3 = document.createElement("video"); v3.muted = true; v3.srcObject = s2; document.body.appendChild(v3);
    const seen = [];
    let poisoned = null;
    for (let i = 0; i < 200 && v3.readyState < 2; i++) {
      seen.push(`${v3.readyState}/${v3.videoWidth}`);
      if (v3.videoWidth > 0 && poisoned === null) {
        try { lm.detectForVideo(v3, T()); poisoned = "no throw"; } catch (e) { poisoned = "throws"; }
      }
      await sleep(1);
    }
    R.states = [...new Set(seen)].join(",");
    R.callAtMetadata = poisoned;
    v3.play(); while (v3.readyState < 2) await sleep(10);
    R.after = await run(lm, 10, v3);
  }
  if (which === "timing") {
    const buf = new Uint8Array(await (await fetch("/mediapipe/face_landmarker.task")).arrayBuffer());
    const inits = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      const fs = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
      const lm = await FaceLandmarker.createFromOptions(fs, { baseOptions: { modelAssetBuffer: buf, delegate: "CPU" }, runningMode: "VIDEO", numFaces: 1 });
      inits.push(Math.round(performance.now() - t0));
      lm.detectForVideo(video, T());
      lm.close();
    }
    R.initMs = inits;
    const lm = await make();
    const c = document.createElement("canvas");
    const g = c.getContext("2d", { willReadFrequently: true });
    const time = async (label, src) => {
      const ms = []; let faces = 0;
      for (let i = 0; i < 30; i++) {
        const t0 = performance.now();
        const input = src();
        const r = lm.detectForVideo(input, T());
        ms.push(performance.now() - t0); if (r.faceLandmarks.length) faces++;
        await sleep(100);
      }
      ms.sort((a, b) => a - b);
      R[label] = { medianMs: Math.round(ms[15]), faces };
    };
    await time("video", () => video);
    await time("canvas", () => { c.width = video.videoWidth; c.height = video.videoHeight; g.drawImage(video, 0, 0); return c; });
    await time("imageData", () => { c.width = video.videoWidth; c.height = video.videoHeight; g.drawImage(video, 0, 0); return g.getImageData(0, 0, c.width, c.height); });
  }
  return R;
}, which);
console.log(JSON.stringify(out, null, 1));
await browser.close();
