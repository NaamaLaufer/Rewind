"""Unit tests for the pure attention-debt functions."""
from app.services.segments import (close_segments, compute_missed_segments, is_low, total_debt,
                                   union_debt)


def r(pos, sm):
    return {"position": pos, "score": sm, "smoothed": sm}


def test_no_low_readings_no_segments():
    assert compute_missed_segments([r(10, 0.8), r(12, 0.9)]) == []


def test_low_run_extends_10s_back():
    segs = compute_missed_segments([r(20, 0.8), r(30, 0.2), r(32, 0.3), r(34, 0.2), r(36, 0.9)])
    assert [(s["start"], s["end"]) for s in segs] == [(20.0, 34.0)]
    assert total_debt(segs) == 14.0


def test_lower_bound_zero():
    segs = compute_missed_segments([r(4, 0.1), r(6, 0.1)])
    assert segs[0]["start"] == 0.0 and segs[0]["end"] == 6.0


def test_close_segments_merge():
    # run1: 30..34 -> [20,34]; run2 at 48 -> [38,48]; gap 4s <= 5 -> merged
    readings = [r(30, 0.2), r(34, 0.2), r(36, 0.9), r(46, 0.9), r(48, 0.2), r(50, 0.9)]
    segs = compute_missed_segments(readings)
    assert [(s["start"], s["end"]) for s in segs] == [(20.0, 48.0)]


def test_far_segments_not_merged():
    readings = [r(30, 0.2), r(32, 0.9), r(100, 0.2), r(102, 0.9)]
    segs = compute_missed_segments(readings)
    assert [(s["start"], s["end"]) for s in segs] == [(20.0, 30.0), (90.0, 100.0)]


def test_seek_splits_run():
    # Chronological low readings, but the user jumped from 30 to 200.
    segs = compute_missed_segments([r(30, 0.2), r(200, 0.2)])
    assert [(s["start"], s["end"]) for s in segs] == [(20.0, 30.0), (190.0, 200.0)]


def test_paragraph_unit():
    readings = [r(0.2, 0.9), r(1.1, 0.2), r(1.8, 0.3), r(2.4, 0.1), r(3.0, 0.8), r(5.5, 0.2)]
    segs = compute_missed_segments(readings, "paragraphs")
    assert [(s["start"], s["end"]) for s in segs] == [(1.0, 2.0), (5.0, 5.0)]
    assert total_debt(segs, "paragraphs") == 3


def test_paragraph_average_decides():
    segs = compute_missed_segments([r(1.0, 0.2), r(1.5, 0.9)], "paragraphs")  # avg 0.55
    assert segs == []


def test_close_segments_by_review_average():
    segs = [{"start": 20.0, "end": 34.0, "closed": False}, {"start": 90.0, "end": 100.0, "closed": False}]
    review = [r(22, 0.7), r(30, 0.6), r(95, 0.2)]
    out, n = close_segments(segs, review, unit="seconds", closed_by="rev1")
    assert n == 1
    assert out[0]["closed"] is True and out[0]["closed_by"] == "rev1"
    assert out[1]["closed"] is False
    assert total_debt(out) == 10.0


def test_close_short_segment_by_watched_flag():
    segs = [{"start": 0.0, "end": 4.0, "closed": False}]
    out, n = close_segments(segs, [], watched_idx=[0])
    assert n == 1 and out[0]["closed"]


def test_watched_flag_ignored_when_readings_are_low():
    segs = [{"start": 0.0, "end": 20.0, "closed": False}]
    out, n = close_segments(segs, [r(10, 0.1)], watched_idx=[0])
    assert n == 0


def test_close_paragraph_segments():
    segs = [{"start": 1.0, "end": 2.0, "closed": False}]
    out, n = close_segments(segs, [r(1.3, 0.8), r(2.6, 0.6)], unit="paragraphs")
    assert n == 1


def test_union_debt_counts_overlap_once():
    a = {"start": 10.0, "end": 30.0, "closed": False}
    b = {"start": 20.0, "end": 40.0, "closed": False}
    c = {"start": 50.0, "end": 60.0, "closed": True}
    assert union_debt([a, b, c]) == 30.0
    p = [{"start": 1.0, "end": 3.0}, {"start": 2.0, "end": 4.0}]
    assert union_debt(p, "paragraphs") == 4


# ---------- client "low" flag (personal threshold / look-away, D-045/D-046) ----------

def rl(pos, sm, low):
    return {"position": pos, "score": sm, "smoothed": sm, "low": low}


def test_low_flag_overrides_fixed_threshold():
    # 0.55 is above 0.40, but the user's personal threshold flagged it low
    assert is_low(rl(10, 0.55, True)) and not is_low(rl(10, 0.3, False))
    assert is_low(r(10, 0.3)) and not is_low(r(10, 0.5))  # legacy readings: fixed 0.40
    segs = compute_missed_segments([rl(20, 0.7, False), rl(22, 0.55, True), rl(24, 0.56, True), rl(26, 0.7, False)])
    assert [(s["start"], s["end"]) for s in segs] == [(12.0, 24.0)]


def test_paragraph_debt_by_low_flag_majority():
    segs = compute_missed_segments([rl(2.1, 0.6, True), rl(2.5, 0.6, True), rl(2.9, 0.7, False),
                                    rl(3.2, 0.3, False)], "paragraphs")
    assert [(s["start"], s["end"]) for s in segs] == [(2.0, 2.0)]


def test_close_segments_uses_low_flag():
    segs = [{"start": 10.0, "end": 30.0, "closed": False, "closed_by": None}]
    # average 0.6 >= 0.5, but most readings are below the user's own threshold -> stays open
    out, n = close_segments(segs, [rl(12, 0.6, True), rl(16, 0.6, True), rl(20, 0.62, False)])
    assert n == 0 and not out[0]["closed"]
    out, n = close_segments(segs, [rl(12, 0.6, False), rl(16, 0.45, True), rl(20, 0.7, False)])
    assert n == 1 and out[0]["closed"]


# ---------- no-face gaps (D-047) ----------

def test_no_face_gap_is_a_segment_without_window_extension():
    segs = compute_missed_segments([r(10, 0.8), r(40, 0.8)], "seconds", [{"start": 20.0, "end": 27.5}])
    assert [(s["start"], s["end"]) for s in segs] == [(20.0, 27.5)]
    assert total_debt(segs) == 7.5


def test_no_face_gap_merges_with_low_run():
    segs = compute_missed_segments([r(30, 0.2), r(32, 0.2)], "seconds", [{"start": 34.0, "end": 40.0}])
    assert [(s["start"], s["end"]) for s in segs] == [(20.0, 40.0)]


def test_no_face_gap_paragraphs():
    segs = compute_missed_segments([r(0.5, 0.9)], "paragraphs", [{"start": 2.3, "end": 4.1}])
    assert [(s["start"], s["end"]) for s in segs] == [(2.0, 4.0)]
