import { mmss } from "../utils/format.js";

/** Low-focus intervention. Shown when the smoothed score drops below the (personal) threshold, or
 *  after looking away / eyes closed for more than 4 s (max once per 45s). `reason` = gaze message. */
export default function AlertBanner({ unit, returnTo, reason, onReturn, onBreak, onClose, aiEnabled, onQuestion }) {
  const isText = unit === "paragraphs";
  return (
    <section className="alert-banner" role="alert" aria-labelledby="alert-title">
      <h2 id="alert-title">⚠️ הקשב שלך ירד</h2>
      {reason && <p className="alert-reason" data-testid="alert-reason"><strong>{reason}.</strong></p>}
      <p>החוב שלך גדל. רוצה לחזור לרגע שבו התחלת לאבד ריכוז?</p>
      <div className="row">
        <button type="button" className="btn btn-primary" onClick={onReturn}>
          ⏪ {isText ? `חזרה לפסקה ${returnTo + 1}` : `חזרה ל-${mmss(returnTo)}`}
        </button>
        <button type="button" className="btn" onClick={onBreak}>הפסקה של 2 דקות</button>
        {isText && aiEnabled && (
          <button type="button" className="btn" onClick={onQuestion}>שאלת בדיקה קצרה</button>
        )}
        <button type="button" className="btn btn-ghost" onClick={onClose}>סגירה</button>
      </div>
      {isText && !aiEnabled && <p className="small muted" style={{ margin: "8px 0 0" }}>שאלות AI לא זמינות בהתקנה הזו.</p>}
    </section>
  );
}
