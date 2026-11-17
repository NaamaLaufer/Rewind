// Unit tests for the smarter intervention (DECISIONS D-045, D-046, D-047).
import { describe, expect, it } from "vitest";
import {
  CALIBRATION_MS, initialAlertState, initialCalibration, isLowReading, returnPoint, stepAlert,
  stepCalibration, thresholdsFor,
} from "./smoothing.js";
import {
  classifyPose, eyeAspectRatio, GAP_TOLERANCE_MS, headPose, initialGazeState, LM, median,
  neutralPose, stepGaze, SUSTAIN_MS,
} from "./gaze.js";
import { computeMissedSegments, initialNoFace, stepNoFace, totalDebt } from "./liveDebt.js";

// ---------- personal calibration ----------
describe("personal calibration", () => {
  const feed = (scores, stepMs = 2000, excluded = () => false) => {
    let c = initialCalibration();
    scores.forEach((s, i) => (c = stepCalibration(c, s, i * stepMs, excluded(i))));
    return c;
  };
  it("baseline = median of the first 30 s of raw scores", () => {
    const c = feed([0.7, 0.75, 0.72, 0.8, 0.6, 0.72, 0.74, 0.7, 0.73, 0.71, 0.72, 0.76, 0.69, 0.72, 0.75, 0.74]);
    expect(c.baseline).toBeCloseTo(0.72);
  });
  it("is still calibrating before 30 s", () => {
    const c = feed([0.7, 0.7, 0.7, 0.7, 0.7, 0.7]); // 10 s
    expect(c.baseline).toBe(null);
    expect(thresholdsFor(c.baseline)).toEqual({ low: 0.4, recover: 0.5 });
  });
  it("needs at least 5 scores even after 30 s", () => {
    const c = feed([0.7, 0.7, 0.7], CALIBRATION_MS);
    expect(c.baseline).toBe(null);
  });
  it("freezes the baseline once computed", () => {
    let c = feed(Array(16).fill(0.7));
    c = stepCalibration(c, 0.1, 99_000);
    expect(c.baseline).toBeCloseTo(0.7);
  });
  it("skips scores taken while looking away", () => {
    const c = feed([0.7, 0.2, 0.7, 0.2, 0.7, 0.2, 0.7, 0.2, 0.7, 0.2, 0.7, 0.2, 0.7, 0.2, 0.7, 0.2], 2000, (i) => i % 2 === 1);
    expect(c.baseline).toBeCloseTo(0.7);
  });
  it("threshold = max(0.40, baseline - 0.15), capped at 0.65, recover = +0.10", () => {
    expect(thresholdsFor(0.72)).toEqual({ low: 0.57, recover: 0.67 });
    expect(thresholdsFor(0.45)).toEqual({ low: 0.4, recover: 0.5 });
    expect(thresholdsFor(0.97)).toEqual({ low: 0.65, recover: 0.75 });
  });
  it("a compressed 0.5-0.8 user: looking away at 0.52 is now low, focused 0.72 is not", () => {
    const th = thresholdsFor(0.72);
    expect(isLowReading(0.52, th)).toBe(true);
    expect(isLowReading(0.72, th)).toBe(false);
    expect(isLowReading(0.9, th, true)).toBe(true); // a sustained look-away is low whatever the score
  });
});

describe("stepAlert with personal thresholds and forced low", () => {
  const th = thresholdsFor(0.72); // 0.57 / 0.67
  it("fires below the personal threshold", () => {
    expect(stepAlert(initialAlertState(), 0.55, 0, { thresholds: th }).fireAlert).toBe(true);
  });
  it("focused user never gets an alert", () => {
    let s = initialAlertState();
    for (const [i, x] of [0.72, 0.68, 0.75, 0.64, 0.7, 0.66].entries()) {
      const r = stepAlert(s, x, i * 2000, { thresholds: th });
      expect(r.fireAlert).toBe(false);
      s = r.state;
    }
  });
  it("hysteresis is 0.10 above the threshold", () => {
    let s = stepAlert(initialAlertState(), 0.5, 0, { thresholds: th }).state;
    s = stepAlert(s, 0.65, 2000, { thresholds: th }).state;
    expect(s.low).toBe(true);
    s = stepAlert(s, 0.68, 4000, { thresholds: th }).state;
    expect(s.low).toBe(false);
  });
  it("forceLow (looking away) fires even with a high score and holds while it lasts", () => {
    const r = stepAlert(initialAlertState(), 0.9, 0, { thresholds: th, forceLow: true });
    expect(r.fireAlert).toBe(true);
    expect(stepAlert(r.state, 0.9, 1000, { thresholds: th, forceLow: true }).state.low).toBe(true);
    expect(stepAlert(r.state, 0.9, 2000, { thresholds: th }).state.low).toBe(false);
  });
  it("returnPoint uses the personal recover threshold and skips low readings", () => {
    const rs = [{ position: 10, smoothed: 0.7 }, { position: 20, smoothed: 0.6 }, { position: 30, smoothed: 0.9, low: true }];
    expect(returnPoint(rs, "seconds", 0.67)).toBe(5);
  });
});

// ---------- head pose / eyes ----------
// A synthetic frontal face: only the landmarks the heuristic reads are placed; the rest sit at the center.
function face({ yaw = 0, pitch = 0, eyeOpen = 0.3 } = {}) {
  const pts = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  const set = (i, x, y, z = 0) => (pts[i] = { x, y, z });
  set(LM.noseTip, 0.5, 0.52, -0.05);
  set(LM.faceLeft, 0.4, 0.5);
  set(LM.faceRight, 0.6, 0.5);
  set(LM.forehead, 0.5, 0.38);
  set(LM.chin, 0.5, 0.65);
  for (const [eye, cx] of [[LM.rightEye, 0.45], [LM.leftEye, 0.55]]) {
    set(eye.outer, cx - 0.02, 0.45);
    set(eye.inner, cx + 0.02, 0.45);
    eye.top.forEach((t, k) => set(t, cx - 0.01 + 0.02 * k, 0.45 - eyeOpen * 0.02 * (4 / 3)));
    eye.bottom.forEach((b, k) => set(b, cx - 0.01 + 0.02 * k, 0.45 + eyeOpen * 0.02 * (4 / 3)));
  }
  // rotate in 3-D (width units, aspect 4:3) around the face center
  const a = (yaw * Math.PI) / 180, b = (pitch * Math.PI) / 180;
  return pts.map((p) => {
    let x = p.x - 0.5, y = (p.y - 0.5) * 0.75, z = p.z;
    [x, z] = [x * Math.cos(a) + z * Math.sin(a), -x * Math.sin(a) + z * Math.cos(a)];
    [y, z] = [y * Math.cos(b) - z * Math.sin(b), y * Math.sin(b) + z * Math.cos(b)];
    return { x: x + 0.5, y: y / 0.75 + 0.5, z };
  });
}

describe("head pose heuristic", () => {
  it("frontal face: yaw and pitch ~0", () => {
    const p = headPose(face());
    expect(Math.abs(p.yaw)).toBeLessThan(1);
    expect(Math.abs(p.pitch)).toBeLessThan(1);
  });
  it("measures a 40° head turn and a 35° nod", () => {
    expect(Math.abs(headPose(face({ yaw: 40 })).yaw)).toBeCloseTo(40, 0);
    expect(Math.abs(headPose(face({ pitch: 35 })).pitch)).toBeCloseTo(35, 0);
  });
  it("eye aspect ratio: open vs closed", () => {
    expect(eyeAspectRatio(face())).toBeGreaterThan(0.25);
    expect(eyeAspectRatio(face({ eyeOpen: 0.03 }))).toBeLessThan(0.1);
  });
  it("median", () => expect(median([3, 1, 2, null])).toBe(2));
  it("nothing is flagged before the neutral pose is known", () => {
    expect(classifyPose(headPose(face({ yaw: 60 })), null).away).toBe(false);
  });
  it("classifies against the user's own neutral pose", () => {
    // the camera sits a bit to the side: the user's normal yaw is 15°
    const neutral = neutralPose(Array(20).fill(headPose(face({ yaw: 15 }))));
    expect(classifyPose(headPose(face({ yaw: 15 })), neutral).away).toBe(false);
    expect(classifyPose(headPose(face({ yaw: 35 })), neutral).away).toBe(false); // 20° off: fine
    const side = classifyPose(headPose(face({ yaw: -25 })), neutral); // 40° off
    expect(side).toMatchObject({ away: true, reason: "side" });
    expect(classifyPose(headPose(face({ yaw: 15, pitch: -35 })), neutral)).toMatchObject({ away: true, reason: "pitch" });
    expect(classifyPose(headPose(face({ yaw: 15, eyeOpen: 0.03 })), neutral)).toMatchObject({ closed: true, reason: "eyes" });
  });
  it("a low-resolution face whose open EAR is tiny is not 'eyes closed' all the time", () => {
    const neutral = neutralPose(Array(20).fill(headPose(face({ eyeOpen: 0.05 }))));
    expect(classifyPose(headPose(face({ eyeOpen: 0.05 })), neutral).closed).toBe(false);
  });
});

describe("stepGaze: more than 4 continuous seconds", () => {
  const away = { away: true, closed: false, reason: "side" };
  const ok = { away: false, closed: false, reason: null };
  const run = (seq) => {
    let s = initialGazeState();
    for (const [cls, t] of seq) s = stepGaze(s, cls, t);
    return s;
  };
  it("not sustained at 4 s, sustained after", () => {
    expect(run([[away, 0], [away, SUSTAIN_MS]]).sustained).toBe(false);
    expect(run([[away, 0], [away, SUSTAIN_MS + 100]])).toMatchObject({ sustained: true, reason: "side" });
  });
  it("a blink-length glance back does not reset the timer", () => {
    expect(run([[away, 0], [away, 2000], [ok, 2300], [away, 2400], [away, 4200]]).sustained).toBe(true);
  });
  it("looking back for longer resets it", () => {
    const s = run([[away, 0], [away, 2000], [ok, 2000 + GAP_TOLERANCE_MS + 1], [away, 4200]]);
    expect(s.sustained).toBe(false);
  });
});

// ---------- no face > 5 s ----------
describe("no-face gaps", () => {
  const run = (seq) => {
    let st = initialNoFace();
    const out = [];
    for (const [nf, t, pos] of seq) {
      const r = stepNoFace(st, nf, t, pos);
      st = r.state;
      out.push(r);
    }
    return out;
  };
  it("a short no-face (< 5 s) is not debt", () => {
    const out = run([[true, 0, 10], [true, 4000, 14], [false, 4500, 14.5]]);
    expect(out.every((r) => r.gap === null && r.live === null)).toBe(true);
  });
  it("more than 5 s becomes a live gap and then a finished gap", () => {
    const out = run([[true, 0, 10], [true, 6000, 16], [false, 9000, 19]]);
    expect(out[1].live).toEqual({ start: 10, end: 16 });
    expect(out[2].gap).toEqual({ start: 10, end: 19 });
  });
  it("gaps become missed segments without the 10 s window extension", () => {
    const segs = computeMissedSegments([{ position: 8, smoothed: 0.8 }], "seconds", [{ start: 10, end: 19 }]);
    expect(segs.map((s) => [s.start, s.end])).toEqual([[10, 19]]);
    expect(totalDebt(segs)).toBe(9);
  });
  it("client low flag overrides 0.40 in the live debt", () => {
    const segs = computeMissedSegments([
      { position: 20, smoothed: 0.7, low: false },
      { position: 22, smoothed: 0.55, low: true },
      { position: 24, smoothed: 0.7, low: false },
    ]);
    expect(segs.map((s) => [s.start, s.end])).toEqual([[12, 22]]);
  });
});
