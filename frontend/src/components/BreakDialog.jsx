import { useEffect, useState } from "react";
import { mmss } from "../utils/format.js";

/** 2-minute breathing break. The video is paused by the caller. */
export default function BreakDialog({ onDone }) {
  const [left, setLeft] = useState(120);
  useEffect(() => {
    const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="dialog-backdrop">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="break-title" style={{ textAlign: "center" }}>
        <h2 id="break-title">הפסקה קצרה</h2>
        <p>נשמי עם העיגול: שאיפה כשהוא גדל, נשיפה כשהוא קטן.</p>
        <div className="breath" aria-hidden="true" />
        <p aria-live="polite" style={{ fontSize: "1.4rem", fontWeight: 700 }}>{left > 0 ? mmss(left) : "אפשר לחזור!"}</p>
        <button type="button" className="btn btn-mint btn-lg" onClick={onDone} autoFocus>חזרה ללמידה</button>
      </div>
    </div>
  );
}
