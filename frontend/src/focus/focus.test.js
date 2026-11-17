import { describe, expect, it } from "vitest";
import { ALERT_COOLDOWN_MS, ema, initialAlertState, returnPoint, stepAlert } from "./smoothing.js";
import { computeMissedSegments, totalDebt } from "./liveDebt.js";
import { argmax, softmax, unrollRing } from "./modelMath.js";
import { extractYouTubeId } from "../utils/youtube.js";
import { levelFromScore } from "../utils/levels.js";
import { formatDebt, mmss } from "../utils/format.js";

describe("ema", () => {
  it("passes the first value through", () => expect(ema(null, 0.8)).toBe(0.8));
  it("averages with the default alpha 0.6", () => expect(ema(0.8, 0.2)).toBeCloseTo(0.44));
  it("supports custom alpha", () => expect(ema(1, 0, 0.25)).toBeCloseTo(0.75));
});

describe("stepAlert (hysteresis + cooldown)", () => {
  it("fires when dropping below 0.40", () => {
    const { state, fireAlert } = stepAlert(initialAlertState(), 0.35, 1000);
    expect(fireAlert).toBe(true);
    expect(state.low).toBe(true);
  });
  it("does not re-fire while still low", () => {
    let s = stepAlert(initialAlertState(), 0.3, 0).state;
    expect(stepAlert(s, 0.2, 5000).fireAlert).toBe(false);
  });
  it("stays low between 0.40 and 0.50 (hysteresis)", () => {
    let s = stepAlert(initialAlertState(), 0.3, 0).state;
    s = stepAlert(s, 0.45, 1000).state;
    expect(s.low).toBe(true);
    s = stepAlert(s, 0.55, 2000).state;
    expect(s.low).toBe(false);
  });
  it("respects the 45s cooldown", () => {
    let s = stepAlert(initialAlertState(), 0.3, 0).state;
    s = stepAlert(s, 0.6, 1000).state;
    const early = stepAlert(s, 0.3, 10_000);
    expect(early.fireAlert).toBe(false);
    expect(early.state.low).toBe(true);
    s = stepAlert(early.state, 0.6, 20_000).state;
    expect(stepAlert(s, 0.3, ALERT_COOLDOWN_MS + 1).fireAlert).toBe(true);
  });
});

describe("returnPoint", () => {
  const rs = [
    { position: 10, smoothed: 0.8 },
    { position: 30, smoothed: 0.6 },
    { position: 32, smoothed: 0.38 },
    { position: 34, smoothed: 0.3 },
  ];
  it("is the last ok reading minus 5s", () => expect(returnPoint(rs)).toBe(25));
  it("never goes below 0", () => expect(returnPoint([{ position: 2, smoothed: 0.9 }])).toBe(0));
  it("falls back to the first reading", () => expect(returnPoint([{ position: 20, smoothed: 0.1 }])).toBe(15));
  it("returns a paragraph index for text", () =>
    expect(returnPoint([{ position: 3.7, smoothed: 0.6 }, { position: 4.2, smoothed: 0.2 }], "paragraphs")).toBe(3));
});

describe("live debt mirrors the server", () => {
  const r = (position, s) => ({ position, score: s, smoothed: s });
  it("extends 10s back and merges close segments", () => {
    const segs = computeMissedSegments([r(30, 0.2), r(34, 0.2), r(36, 0.9), r(46, 0.9), r(48, 0.2), r(50, 0.9)]);
    expect(segs.map((s) => [s.start, s.end])).toEqual([[20, 48]]);
    expect(totalDebt(segs)).toBe(28);
  });
  it("clamps at 0", () => expect(computeMissedSegments([r(4, 0.1), r(6, 0.1)])[0].start).toBe(0));
  it("counts paragraphs", () => {
    const segs = computeMissedSegments([r(1.1, 0.2), r(1.8, 0.3), r(2.4, 0.1), r(3, 0.8)], "paragraphs");
    expect(segs.map((s) => [s.start, s.end])).toEqual([[1, 2]]);
    expect(totalDebt(segs, "paragraphs")).toBe(2);
  });
});

describe("model helpers", () => {
  it("softmax sums to 1", () => expect(softmax([1, 2, 3]).reduce((a, b) => a + b)).toBeCloseTo(1));
  it("argmax", () => expect(argmax([0.1, 3, -1, 2])).toBe(1));
  it("unrolls a ring buffer chronologically", () => {
    const ring = new Float32Array([3, 1, 2]); // capacity 3, frameSize 1, next write at index 1
    expect(Array.from(unrollRing(ring, 1, 3, 1))).toEqual([1, 2, 3]);
  });
});

describe("extractYouTubeId", () => {
  it.each([
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ?t=10",
    "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    "https://www.youtube.com/embed/dQw4w9WgXcQ",
    "https://m.youtube.com/watch?feature=share&v=dQw4w9WgXcQ",
  ])("%s", (url) => expect(extractYouTubeId(url)).toBe("dQw4w9WgXcQ"));
  it("rejects other sites", () => expect(extractYouTubeId("https://example.com/watch?v=dQw4w9WgXcQ")).toBe(null));
});

describe("levels and formatting", () => {
  it("maps score to level", () => {
    expect(levelFromScore(0.05)).toBe(0);
    expect(levelFromScore(0.3)).toBe(1);
    expect(levelFromScore(0.5)).toBe(2);
    expect(levelFromScore(0.65)).toBe(2);
    expect(levelFromScore(0.6997)).toBe(3); // shown as 0.70 -> same word as the mint color
    expect(levelFromScore(0.7)).toBe(3);
    expect(levelFromScore(0.95)).toBe(4);
  });
  it("formats mm:ss", () => expect(mmss(80)).toBe("1:20"));
  it("formats debt", () => {
    expect(formatDebt(80, "seconds")).toBe("1:20 דק׳");
    expect(formatDebt(3, "paragraphs")).toBe("3 פסקאות");
  });
});
