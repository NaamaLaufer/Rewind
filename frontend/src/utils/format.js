// Display helpers (Hebrew, RTL-friendly).

export function mmss(seconds) {
  const s = Math.max(0, Math.round(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

export function formatDebt(value, unit) {
  if (unit === "paragraphs") {
    const n = Math.round(value || 0);
    return n === 1 ? "פסקה אחת" : `${n} פסקאות`;
  }
  return `${mmss(value)} דק׳`;
}

export function formatSegment(seg, unit) {
  if (unit === "paragraphs") {
    return seg.start === seg.end ? `פסקה ${seg.start + 1}` : `פסקאות ${seg.start + 1}–${seg.end + 1}`;
  }
  return `${mmss(seg.start)}–${mmss(seg.end)}`;
}

const dateFmt = new Intl.DateTimeFormat("he-IL", {
  day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
});
const dayFmt = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "long", year: "numeric" });

export const formatDateTime = (iso) => (iso ? dateFmt.format(new Date(iso)) : "—");
export const formatDate = (iso) => (iso ? dayFmt.format(new Date(iso)) : "—");

export function formatDuration(startIso, endIso) {
  if (!startIso || !endIso) return "—";
  const sec = Math.max(0, (new Date(endIso) - new Date(startIso)) / 1000);
  if (sec < 60) return `${Math.round(sec)} שנ׳`;
  return `${Math.round(sec / 60)} דק׳`;
}

export const formatScore = (s) => (s === null || s === undefined ? "—" : Number(s).toFixed(2));

/** CSS color variable for a score: mint (high), amber (middle), coral (low). */
export function scoreColor(score) {
  if (score === null || score === undefined) return "var(--muted)";
  const s = Math.round(score * 100) / 100; // same rounding as the number shown
  if (s >= 0.7) return "var(--mint)";
  if (s >= 0.4) return "var(--amber)";
  return "var(--coral)";
}

export const TYPE_LABELS = { youtube: "סרטון YouTube", text: "טקסט", web: "דף אינטרנט" };
export const MODE_LABELS = { watch: "צפייה רגילה", review: "מעבר שני" };
