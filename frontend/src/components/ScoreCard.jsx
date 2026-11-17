import { WINDOW } from "../focus/config.js";
import { formatScore, scoreColor } from "../utils/format.js";
import { LEVEL_LABELS, levelFromScore } from "../utils/levels.js";

/** The main, most prominent element: the latest raw score as a big number + label + color bar. */
export default function ScoreCard({ score, smoothed, modelLevel, framesFilled, noFace, fps, detectMs, calibration }) {
  const waiting = score === null || score === undefined;
  // Estimate with the real measured frame rate (slow machines fill the window more slowly).
  const rate = fps && fps > 0.5 ? Math.min(10, fps) : 10;
  const secondsLeft = Math.max(0, Math.ceil((WINDOW - framesFilled) / rate));
  const level = levelFromScore(score);

  return (
    <section className="card score-card" aria-labelledby="score-title" data-fps={fps ?? ""} data-detect-ms={detectMs ?? ""}>
      <h2 id="score-title">ציון הריכוז שלך</h2>
      {waiting ? (
        <div aria-live="polite">
          <div className="score-number muted" aria-hidden="true">—</div>
          <p>
            {noFace
              ? "מחכה לפנים מול המצלמה..."
              : `אוספת נתונים... הציון הראשון יופיע בעוד כ-${Math.max(secondsLeft, 1)} שניות`}
          </p>
          <div className="progress" role="progressbar" aria-label="מילוי חלון המדידה"
            aria-valuemin={0} aria-valuemax={WINDOW} aria-valuenow={framesFilled}>
            <span style={{ width: `${(framesFilled / WINDOW) * 100}%` }} />
          </div>
          <p className="small muted">המודל צריך כ-10 שניות של פריימים ({framesFilled}/{WINDOW})</p>
        </div>
      ) : (
        <div>
          <div className="score-number" data-testid="score-value" style={{ color: scoreColor(score) }}
            aria-live="polite" aria-label={`ציון ריכוז ${formatScore(score)}`}>
            {formatScore(score)}
          </div>
          <div className="score-label" data-testid="score-label">{LEVEL_LABELS[level]}</div>
          <div className="score-bar" aria-hidden="true">
            <span style={{ width: `${score * 100}%`, background: scoreColor(score) }} />
          </div>
          <p className="small muted" style={{ margin: 0 }}>מתעדכן כל 2 שניות · 0 = לא מרוכזת, 1 = מרוכזת מאוד</p>
          <p className="small" style={{ margin: "6px 0 0" }}>
            ציון מוחלק: <strong>{formatScore(smoothed)}</strong>
            {modelLevel !== null && modelLevel !== undefined && (
              <span className="muted"> · סיווג המודל: {LEVEL_LABELS[modelLevel]}</span>
            )}
          </p>
          {calibration && (
            <p className="small calibration-line" data-testid="calibration" style={{ margin: "6px 0 0" }}>
              {calibration.baseline !== null ? (
                <>כיול אישי: הרמה הרגילה שלך <strong>{formatScore(calibration.baseline)}</strong>
                  <span className="muted"> · התראה מתחת ל-{formatScore(calibration.threshold)}</span></>
              ) : (
                <span className="muted">כיול אישי: לומדת את הרמה הרגילה שלך{calibration.left > 0 ? ` (עוד כ-${calibration.left} שניות)` : "..."}</span>
              )}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
