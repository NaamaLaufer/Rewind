"""Attention-debt logic: pure functions, fully unit-tested.

A "missed segment" is a run of consecutive LOW readings. A reading is low when the client
flagged it (`low`: personal calibrated threshold or a sustained look-away, DECISIONS D-045);
older readings without the flag fall back to smoothed < THRESHOLD. No-face gaps longer than
5 seconds (`no_face_gaps`, sent by the client) are missed time too (D-047). For video (seconds) the segment extends 10s before the first low reading
(the model window looks ~10s back) and nearby segments merge. For text the unit is a
paragraph index and a paragraph is "in debt" when its average smoothed score is low.

The server is the single source of truth for debt; the client only displays it.
"""
from collections import defaultdict

THRESHOLD = 0.40        # below this smoothed score = low focus
CLOSE_THRESHOLD = 0.50  # review average at/above this closes a segment
WINDOW_BACK = 10.0      # seconds the model window covers before a reading
MERGE_GAP = 5.0         # merge segments whose gap is <= this many seconds


def _sm(reading: dict) -> float:
    """Smoothed score if present, else the raw score."""
    v = reading.get("smoothed")
    return v if v is not None else reading.get("score", 0.0)


def is_low(reading: dict) -> bool:
    """The client's decision when present, else the fixed 0.40 rule."""
    flag = reading.get("low")
    if flag is not None:
        return bool(flag)
    return _sm(reading) < THRESHOLD


def compute_missed_segments(readings: list[dict], unit: str = "seconds",
                            no_face_gaps: list[dict] | None = None) -> list[dict]:
    """Return missed segments as [{start, end, closed, closed_by}]."""
    gaps = no_face_gaps or []
    if unit == "paragraphs":
        return _missed_paragraphs(readings, gaps)
    return _missed_seconds(readings, gaps)


MAX_STEP = 15.0  # a position jump bigger than this (or backwards) = the user seeked


def _missed_seconds(readings: list[dict], gaps: list[dict] = ()) -> list[dict]:
    """`readings` must be in chronological (created_at) order."""
    runs: list[list[float]] = []
    cur: list[float] | None = None
    prev_pos: float | None = None
    for r in readings:
        pos = float(r["position"])
        seeked = prev_pos is not None and (pos < prev_pos - 1 or pos > prev_pos + MAX_STEP)
        if is_low(r):
            if cur is not None and seeked:
                runs.append(cur)
                cur = None
            if cur is None:
                cur = [pos, pos]
            else:
                cur[0], cur[1] = min(cur[0], pos), max(cur[1], pos)
        elif cur is not None:
            runs.append(cur)
            cur = None
        prev_pos = pos
    if cur is not None:
        runs.append(cur)

    # Extend 10s back (the model window) and clamp at 0.
    raw = [[max(0.0, first - WINDOW_BACK), last] for first, last in runs]
    # No-face gaps are already exact content ranges: no window extension.
    raw += [[max(0.0, float(g["start"])), float(g["end"])] for g in gaps]
    raw.sort()
    return [_seg(round(a, 3), round(b, 3)) for a, b in merge_intervals(raw) if b > a]


def merge_intervals(intervals: list[list[float]], gap: float = MERGE_GAP) -> list[list[float]]:
    """Merge sorted [start, end] intervals that overlap or are at most `gap` apart."""
    merged: list[list[float]] = []
    for a, b in sorted(intervals):
        if merged and a - merged[-1][1] <= gap:
            merged[-1][1] = max(merged[-1][1], b)
        else:
            merged.append([a, b])
    return merged


def union_debt(segments: list[dict], unit: str = "seconds") -> float:
    """Debt of several sessions' open segments without double-counting overlaps."""
    open_segs = [s for s in segments if not s.get("closed")]
    if unit == "paragraphs":
        idx: set[int] = set()
        for s in open_segs:
            idx.update(range(int(s["start"]), int(s["end"]) + 1))
        return float(len(idx))
    merged = merge_intervals([[s["start"], s["end"]] for s in open_segs], gap=0)
    return round(sum(b - a for a, b in merged), 3)


def unit_for(content_type: str) -> str:
    return "paragraphs" if content_type in ("text", "web") else "seconds"


def _paragraph_in_debt(rs: list[dict]) -> bool:
    if any(r.get("low") is not None for r in rs):
        return sum(is_low(r) for r in rs) * 2 >= len(rs)  # at least half of its readings low
    return sum(_sm(r) for r in rs) / len(rs) < THRESHOLD   # legacy rule: low average


def _missed_paragraphs(readings: list[dict], gaps: list[dict] = ()) -> list[dict]:
    buckets: dict[int, list[dict]] = defaultdict(list)
    for r in readings:
        buckets[int(r["position"])].append(r)

    debt_set = {i for i, rs in buckets.items() if _paragraph_in_debt(rs)}
    for g in gaps:  # every paragraph the reader was on while no face was visible
        debt_set.update(range(int(g["start"]), int(g["end"]) + 1))
    debt = sorted(debt_set)

    segs: list[list[int]] = []
    for idx in debt:
        if segs and idx == segs[-1][1] + 1:
            segs[-1][1] = idx
        else:
            segs.append([idx, idx])
    return [_seg(float(a), float(b)) for a, b in segs]


def _seg(start: float, end: float) -> dict:
    return {"start": start, "end": end, "closed": False, "closed_by": None}


def segment_length(seg: dict, unit: str) -> float:
    if unit == "paragraphs":
        return seg["end"] - seg["start"] + 1
    return seg["end"] - seg["start"]


def total_debt(segments: list[dict], unit: str = "seconds", only_open: bool = True) -> float:
    total = 0.0
    for s in segments:
        if only_open and s.get("closed"):
            continue
        total += segment_length(s, unit)
    return round(total, 3)


def _focused_enough(rs: list[dict]) -> bool:
    if any(r.get("low") is not None for r in rs):
        return sum(not is_low(r) for r in rs) * 2 >= len(rs)
    return sum(_sm(r) for r in rs) / len(rs) >= CLOSE_THRESHOLD


def close_segments(
    segments: list[dict],
    review_readings: list[dict],
    watched_idx: set[int] | list[int] | None = None,
    unit: str = "seconds",
    closed_by: str | None = None,
):
    """Return (updated_segments, closed_count).

    A segment closes when review readings inside its range show focus: when the readings carry
    the client's `low` flag, at least half of them must be NOT low (personal threshold, D-045);
    legacy readings: average >= CLOSE_THRESHOLD. Or when the client reported it watched
    (short segments with no readings).
    Review readings never create new segments.
    """
    watched = set(watched_idx or [])
    closed_count = 0
    out: list[dict] = []

    for i, seg in enumerate(segments):
        s = dict(seg)
        if s.get("closed"):
            out.append(s)
            continue

        if unit == "paragraphs":
            inside = [r for r in review_readings if s["start"] <= int(r["position"]) <= s["end"]]
        else:
            inside = [r for r in review_readings if s["start"] <= r["position"] <= s["end"]]

        should_close = False
        if inside and _focused_enough(inside):
            should_close = True
        elif not inside and i in watched:  # "watched" only counts when no reading fits inside
            should_close = True

        if should_close:
            s["closed"] = True
            s["closed_by"] = closed_by
            closed_count += 1
        out.append(s)

    return out, closed_count
