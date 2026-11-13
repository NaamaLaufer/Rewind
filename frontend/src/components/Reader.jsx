import { forwardRef, useImperativeHandle, useRef } from "react";

const READ_LINE = 120; // px from the top of the viewport (below the sticky navbar)

/** Heat-map tint for a paragraph by the average focus measured while reading it. */
function heat(avg) {
  if (avg === undefined) return undefined;
  if (avg >= 0.7) return "rgba(47, 163, 122, 0.13)";
  if (avg >= 0.4) return "rgba(224, 160, 27, 0.15)";
  return "rgba(224, 88, 75, 0.15)";
}

/**
 * Reading view for text and web pages. Every paragraph is <p data-idx>. The position is
 * "paragraph index + fraction scrolled" at the reading line, e.g. 3.4.
 * `visible` (Set) limits which paragraphs are shown (Second Pass shows only the debt ones).
 */
const Reader = forwardRef(function Reader({ paragraphs, heatAvg = {}, debtSet = new Set(), visible = null, current = null }, ref) {
  const rootRef = useRef(null);

  useImperativeHandle(ref, () => ({
    getPosition() {
      const els = rootRef.current?.querySelectorAll("p[data-idx]") ?? [];
      let last = 0;
      for (const el of els) {
        const r = el.getBoundingClientRect();
        const idx = Number(el.dataset.idx);
        last = idx;
        if (r.bottom > READ_LINE) {
          const frac = Math.min(0.99, Math.max(0, (READ_LINE - r.top) / Math.max(1, r.height)));
          return Math.round((idx + frac) * 100) / 100;
        }
      }
      return last;
    },
    scrollToParagraph(i) {
      const el = rootRef.current?.querySelector(`p[data-idx="${Math.floor(i)}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
  }));

  const out = [];
  let hidden = 0;
  paragraphs.forEach((text, i) => {
    if (visible && !visible.has(i)) {
      hidden += 1;
      return;
    }
    if (hidden) {
      out.push(<div key={`gap${i}`} className="collapsed-gap">… {hidden} פסקאות מקופלות</div>);
      hidden = 0;
    }
    out.push(
      <p key={i} data-idx={i} className={`para ${debtSet.has(i) ? "debt" : ""} ${current === i ? "current" : ""}`}
        style={{ background: heat(heatAvg[i]), scrollMarginTop: READ_LINE - 20 }}
        title={debtSet.has(i) ? "פסקה בחוב קשב: נקראה בלי ריכוז" : undefined}>
        {text}
      </p>,
    );
  });
  if (hidden) out.push(<div key="gap-end" className="collapsed-gap">… {hidden} פסקאות מקופלות</div>);

  return (
    <article className="reader" ref={rootRef} aria-label="תוכן לקריאה">
      {out}
    </article>
  );
});

export default Reader;
