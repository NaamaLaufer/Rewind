// Client-side preview of the attention debt WHILE a session runs.
// It mirrors backend/app/services/segments.py so the live numbers match what the server
// computes at /end. The server stays the source of truth: after /end we show its numbers.

const THRESHOLD = 0.4;
const WINDOW_BACK = 10;
const MERGE_GAP = 5;
const MAX_STEP = 15;

const sm = (r) => (r.smoothed ?? r.score);

function mergeIntervals(intervals, gap = MERGE_GAP) {
  const out = [];
  for (const [a, b] of [...intervals].sort((x, y) => x[0] - y[0] || x[1] - y[1])) {
    if (out.length && a - out[out.length - 1][1] <= gap) {
      out[out.length - 1][1] = Math.max(out[out.length - 1][1], b);
    } else out.push([a, b]);
  }
  return out;
}

function missedSeconds(readings) {
  const runs = [];
  let cur = null;
  let prev = null;
  for (const r of readings) {
    const pos = r.position;
    const seeked = prev !== null && (pos < prev - 1 || pos > prev + MAX_STEP);
    if (sm(r) < THRESHOLD) {
      if (cur && seeked) {
        runs.push(cur);
        cur = null;
      }
      if (!cur) cur = [pos, pos];
      else cur = [Math.min(cur[0], pos), Math.max(cur[1], pos)];
    } else if (cur) {
      runs.push(cur);
      cur = null;
    }
    prev = pos;
  }
  if (cur) runs.push(cur);
  return mergeIntervals(runs.map(([a, b]) => [Math.max(0, a - WINDOW_BACK), b]))
    .filter(([a, b]) => b > a)
    .map(([start, end]) => ({ start, end, closed: false }));
}

function missedParagraphs(readings) {
  const buckets = new Map();
  for (const r of readings) {
    const i = Math.floor(r.position);
    if (!buckets.has(i)) buckets.set(i, []);
    buckets.get(i).push(sm(r));
  }
  const debt = [...buckets.entries()]
    .filter(([, v]) => v.reduce((a, b) => a + b, 0) / v.length < THRESHOLD)
    .map(([i]) => i)
    .sort((a, b) => a - b);
  const segs = [];
  for (const i of debt) {
    if (segs.length && i === segs[segs.length - 1].end + 1) segs[segs.length - 1].end = i;
    else segs.push({ start: i, end: i, closed: false });
  }
  return segs;
}

/** readings must be chronological. unit: "seconds" | "paragraphs" */
export function computeMissedSegments(readings, unit = "seconds") {
  return unit === "paragraphs" ? missedParagraphs(readings) : missedSeconds(readings);
}

export function segmentLength(seg, unit) {
  return unit === "paragraphs" ? seg.end - seg.start + 1 : seg.end - seg.start;
}

export function totalDebt(segments, unit = "seconds") {
  return segments.filter((s) => !s.closed).reduce((sum, s) => sum + segmentLength(s, unit), 0);
}
