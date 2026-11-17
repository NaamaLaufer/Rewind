// Client-side preview of the attention debt WHILE a session runs.
// It mirrors backend/app/services/segments.py so the live numbers match what the server
// computes at /end. The server stays the source of truth: after /end we show its numbers.

const THRESHOLD = 0.4;
const WINDOW_BACK = 10;
const MERGE_GAP = 5;
const MAX_STEP = 15;

const sm = (r) => (r.smoothed ?? r.score);
// Same rule as segments.is_low on the server: the client's flag (personal threshold or a
// sustained look-away), else the fixed 0.40.
const isLow = (r) => (r.low !== undefined && r.low !== null ? !!r.low : sm(r) < THRESHOLD);

function mergeIntervals(intervals, gap = MERGE_GAP) {
  const out = [];
  for (const [a, b] of [...intervals].sort((x, y) => x[0] - y[0] || x[1] - y[1])) {
    if (out.length && a - out[out.length - 1][1] <= gap) {
      out[out.length - 1][1] = Math.max(out[out.length - 1][1], b);
    } else out.push([a, b]);
  }
  return out;
}

function missedSeconds(readings, gaps) {
  const runs = [];
  let cur = null;
  let prev = null;
  for (const r of readings) {
    const pos = r.position;
    const seeked = prev !== null && (pos < prev - 1 || pos > prev + MAX_STEP);
    if (isLow(r)) {
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
  const raw = runs.map(([a, b]) => [Math.max(0, a - WINDOW_BACK), b]);
  for (const g of gaps) raw.push([Math.max(0, g.start), g.end]); // no-face gaps: exact ranges
  return mergeIntervals(raw)
    .filter(([a, b]) => b > a)
    .map(([start, end]) => ({ start, end, closed: false }));
}

function paragraphInDebt(rs) {
  if (rs.some((r) => r.low !== undefined && r.low !== null)) return rs.filter(isLow).length * 2 >= rs.length;
  return rs.reduce((a, r) => a + sm(r), 0) / rs.length < THRESHOLD;
}

function missedParagraphs(readings, gaps) {
  const buckets = new Map();
  for (const r of readings) {
    const i = Math.floor(r.position);
    if (!buckets.has(i)) buckets.set(i, []);
    buckets.get(i).push(r);
  }
  const set = new Set([...buckets.entries()].filter(([, rs]) => paragraphInDebt(rs)).map(([i]) => i));
  for (const g of gaps) for (let i = Math.floor(g.start); i <= Math.floor(g.end); i++) set.add(i);
  const segs = [];
  for (const i of [...set].sort((a, b) => a - b)) {
    if (segs.length && i === segs[segs.length - 1].end + 1) segs[segs.length - 1].end = i;
    else segs.push({ start: i, end: i, closed: false });
  }
  return segs;
}

/** readings must be chronological. unit: "seconds" | "paragraphs". gaps: no-face ranges > 5 s */
export function computeMissedSegments(readings, unit = "seconds", gaps = []) {
  return unit === "paragraphs" ? missedParagraphs(readings, gaps) : missedSeconds(readings, gaps);
}

// ---- No face for more than 5 continuous seconds = missed content time (D-047) ----
export const NO_FACE_GAP_MS = 5000;
export const initialNoFace = () => ({ since: null, startPos: null });

const gapRange = (a, b) => ({ start: Math.min(a, b), end: Math.max(a, b) });

/**
 * Call regularly with the engine's noFace flag and the current content position.
 * Returns { state, gap, live }:
 *   gap  = a FINISHED gap longer than 5 s (report it to the server once),
 *   live = the ongoing gap once it passed 5 s (shown in the live debt), else null.
 * End of session: call once more with noFace=false to flush an ongoing gap.
 */
export function stepNoFace(state, noFace, now, position) {
  if (noFace) {
    const s = state.since === null ? { since: now, startPos: position } : state;
    return { state: s, gap: null, live: now - s.since > NO_FACE_GAP_MS ? gapRange(s.startPos, position) : null };
  }
  if (state.since === null) return { state, gap: null, live: null };
  const gap = now - state.since > NO_FACE_GAP_MS ? gapRange(state.startPos, position) : null;
  return { state: initialNoFace(), gap, live: null };
}

export function segmentLength(seg, unit) {
  return unit === "paragraphs" ? seg.end - seg.start + 1 : seg.end - seg.start;
}

export function totalDebt(segments, unit = "seconds") {
  return segments.filter((s) => !s.closed).reduce((sum, s) => sum + segmentLength(s, unit), 0);
}
