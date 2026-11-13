import { formatScore, formatSegment, mmss, scoreColor } from "../utils/format.js";

/**
 * "Focus Tape": a cassette-tape strip under the content. Every reading is a colored cell at its
 * position in the content (start on the RIGHT, like the Hebrew text). Missed segments get a red
 * frame with ⏪; clicking jumps there. Gray dashed cells = no face detected.
 */
export default function FocusTape({ readings, noFaceMarks = [], length, segments = [], unit, playhead, onSeek, title = "סרט הקשב" }) {
  const isText = unit === "paragraphs";
  const maxPos = Math.max(0, ...readings.map((r) => r.position), ...segments.map((s) => s.end), playhead ?? 0);
  const total = Math.max(length || 0, maxPos + (isText ? 1 : 10), isText ? 1 : 30);
  const pct = (p) => `${Math.min(100, (p / total) * 100)}%`;
  const cellW = isText ? Math.max(0.6, 100 / total / 3) : Math.max(0.5, (2 / total) * 100);
  const label = (p) => (isText ? `פסקה ${Math.floor(p) + 1}` : mmss(p));

  return (
    <section className="tape" aria-labelledby="tape-title">
      <div className="tape-head">
        <strong id="tape-title">📼 {title}</strong>
        <span>{readings.length} מדידות · לחיצה על משבצת קופצת למקום הזה בתוכן</span>
      </div>
      <div className="tape-track" dir="rtl">
        {segments.map((s, i) => (
          <button key={`s${i}`} type="button" className={`tape-seg ${s.closed ? "closed" : ""}`}
            style={{ right: pct(s.start), width: `max(18px, calc(${pct(s.end - s.start + (isText ? 1 : 0))}))` }}
            title={`${s.closed ? "נסגר ✓" : "קטע שהוחמץ"} · ${formatSegment(s, unit)}`}
            aria-label={`${s.closed ? "קטע שנסגר" : "קטע שהוחמץ"} ${formatSegment(s, unit)}. מעבר לשם`}
            onClick={() => onSeek?.(s.start)}>
            {s.closed ? "✓" : "⏪"}
          </button>
        ))}
        {noFaceMarks.map((p, i) => (
          <span key={`n${i}`} className="tape-cell noface" style={{ right: pct(p), width: `${cellW}%` }} title={`${label(p)} · אין פנים`} />
        ))}
        {readings.map((r, i) => (
          <button key={i} type="button" className="tape-cell" tabIndex={-1}
            style={{ right: pct(r.position), width: `${cellW}%`, background: scoreColor(r.score) }}
            title={`${label(r.position)} · ${formatScore(r.score)}`}
            onClick={() => onSeek?.(r.position)} />
        ))}
        {playhead !== null && playhead !== undefined && <span className="tape-head-pos" style={{ right: pct(playhead) }} />}
      </div>
      <div className="tape-legend" aria-hidden="true">
        <span><i style={{ background: "var(--mint)" }} />מרוכזת (0.7+)</span>
        <span><i style={{ background: "var(--amber)" }} />ביניים</span>
        <span><i style={{ background: "var(--coral)" }} />קשב נמוך</span>
        <span><i style={{ border: "1.5px dashed #a8b3c9" }} />אין פנים</span>
        <span><i style={{ border: "2px solid var(--coral)" }} />⏪ קטע שהוחמץ</span>
      </div>
      {segments.length > 0 && (
        <div className="seg-list">
          {segments.map((s, i) => (
            <button key={i} type="button" className={`seg-chip ${s.closed ? "closed" : ""}`} onClick={() => onSeek?.(s.start)}>
              {s.closed ? "✓" : "⏪"} {formatSegment(s, unit)}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
