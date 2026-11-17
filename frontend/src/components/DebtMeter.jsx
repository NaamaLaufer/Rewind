import { useEffect, useRef, useState } from "react";
import { formatDebt } from "../utils/format.js";

/** "Attention debt" counter: always shown next to (never instead of) the numeric score. */
export default function DebtMeter({ value, unit }) {
  const prev = useRef(value);
  const [bump, setBump] = useState(false);
  useEffect(() => {
    if (value > prev.current) {
      setBump(true);
      const t = setTimeout(() => setBump(false), 750);
      prev.current = value;
      return () => clearTimeout(t);
    }
    prev.current = value;
    return undefined;
  }, [value]);

  const text = formatDebt(value, unit);
  return (
    <section className="card" aria-labelledby="debt-title">
      <div className="debt-meter">
        <h2 id="debt-title" style={{ margin: 0 }}>חוב קשב</h2>
        <span className={`debt-value ${value > 0 ? "" : "zero"} ${bump ? "bump" : ""}`}
          aria-live="polite" data-testid="debt-value">
          {text}
        </span>
      </div>
      <p className="small muted" style={{ margin: "6px 0 0" }}>
        {unit === "paragraphs" ? "פסקאות שנקראו בלי ריכוז." : "זמן תוכן שעבר בלי ריכוז."} אפשר להשלים במעבר שני בסוף.
      </p>
    </section>
  );
}
