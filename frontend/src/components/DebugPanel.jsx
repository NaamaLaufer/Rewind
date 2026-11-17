// Diagnostic panel, shown only with ?debug=1 in the URL. Explains WHY "no face" is shown.
// "העתקת אבחון" copies a JSON snapshot of the camera/engine state (D-051), to paste into a bug report.
import { useState } from "react";
import { focusDiagnostics } from "../focus/useFocusEngine.js";

function withParams(changes) {
  const u = new URL(window.location.href);
  for (const [k, v] of Object.entries(changes)) {
    if (v === null) u.searchParams.delete(k);
    else u.searchParams.set(k, v);
  }
  return u.pathname + u.search;
}

function hints(d, cam, track) {
  const out = [];
  if (cam.status !== "on") out.push("המצלמה לא פעילה כרגע: לחצי 'הפעלת מצלמה'.");
  if (!d) return out;
  if (track && track.readyState !== "live") out.push("ה-track של המצלמה לא במצב live (המצלמה נותקה או נתפסה ע\"י תוכנה אחרת).");
  if (cam.status === "on" && d.framesPerSec === 0) out.push("לא מגיעים פריימים לניתוח (readyState/paused). בדקי שהווידאו בתצוגה המקדימה זז.");
  if (d.brightness !== null && d.brightness < 15) out.push("הפריימים ש-MediaPipe מקבל כמעט שחורים, למרות שהתצוגה אולי נראית תקינה. העתיקי אבחון ושלחי.");
  if (d.detectorScore !== null && d.detectorScore >= 0.75 && d.facesPerSec === 0)
    out.push("הגלאי (FaceDetector) רואה פנים אבל FaceLandmarker לא: העתיקי אבחון ושלחי.");
  if (d.detectorScore !== null && d.detectorScore > 0 && d.detectorScore < 0.75 && d.facesPerSec === 0)
    out.push("ביטחון הזיהוי נמוך (מתחת ל-0.75): תאורה חלשה, אור מאחור, או מרחק גדול מהמצלמה. אם רואים פנים בתצוגה, זה חשוד.");
  if (d.detectorReady && d.detectorScore < 0.2 && d.facesPerSec === 0 && d.brightness >= 15) out.push("שום גלאי לא מוצא פנים בפריים: בדקי שבחרת את המצלמה הנכונה ושהפנים במרכז.");
  if (d.facesPerSec > 0) out.push("פנים מזוהות ✓");
  if (d.detectMs !== null && d.detectMs > 150)
    out.push(`הזיהוי איטי (${d.detectMs}ms לפריים): המחשב עמוס, ולכן החלון מתמלא לאט והציון מתעכב. סגרי לשוניות ותוכנות כבדות.`);
  return out;
}

const fmt = (x) => (x === null || x === undefined ? "—" : Number(x).toFixed(2));

export default function DebugPanel({ engine, cam, stream, calibration, noFaceFor }) {
  const d = engine.debug;
  const [copied, setCopied] = useState(null); // null | "ok" | JSON text (clipboard failed)
  const copy = async () => {
    const text = JSON.stringify(focusDiagnostics(), null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setCopied("ok");
    } catch {
      setCopied(text); // show it so it can be copied by hand
    }
  };
  const track = stream?.getVideoTracks?.()[0] ?? null;
  const settings = track?.getSettings?.() ?? {};
  const rows = [
    ["פנים שזוהו בשנייה", d ? `${d.facesPerSec} מתוך ${d.framesPerSec} פריימים שנותחו` : "—"],
    ["ביטחון זיהוי (FaceDetector)", d ? (d.detectorReady ? `הכי גבוה: ${(d.detectorScore ?? 0).toFixed(2)} · פנים מעל 0.75: ${d.detectorFaces ?? 0}` : "נטען...") : "—"],
    ["פנים ב-FaceLandmarker (פריים אחרון)", d ? d.landmarkFaces : "—"],
    ["רזולוציית וידאו", d ? `${d.videoSize} (track: ${settings.width ?? "?"}×${settings.height ?? "?"} @ ${settings.frameRate ? Math.round(settings.frameRate) : "?"}fps)` : "—"],
    ["מצלמה נבחרת", track ? `${track.label || "(ללא שם)"} · ${track.readyState}${track.muted ? " · muted" : ""}` : "אין stream"],
    ["בהירות פריים (0–255)", d?.brightness ?? "—"],
    ["delegate / input", d ? `${d.delegate ?? "טרם נטען"} / ${d.input}` : "—"],
    ["אתחול FaceLandmarker", d?.landmarkerInitMs != null ? `${d.landmarkerInitMs}ms` : "—"],
    ["זמן לפריים: העתקה / זיהוי", d ? `${d.copyMs ?? "—"}ms / ${d.detectMs ?? "—"}ms` : "—"],
    ["פריימים שנותחו / עם פנים", d ? `${d.ticks} / ${d.facesFound}` : "—"],
    ["מצב מנוע", `${engine.status} · noFace=${String(engine.noFace)} · חלון ${engine.framesFilled}/100 · מצלמה=${cam.status}`],
    ["ציון גולמי / מוחלק", `${fmt(engine.score)} / ${fmt(engine.smoothed)}`],
    ["כיול: רמה רגילה / סף / יציאה", calibration ? `${fmt(calibration.baseline)} / ${fmt(calibration.threshold)} / ${fmt(calibration.recover)}${calibration.baseline === null ? ` (מכיילת, עוד ${calibration.left} שנ')` : ""}` : "—"],
    ["תנוחת ראש yaw / pitch", d?.yaw != null ? `${d.yaw}° / ${d.pitch}°${d.neutral ? ` (רגיל: ${d.neutral.yaw}° / ${d.neutral.pitch}°)` : ` (לומדת תנוחה רגילה ${d.neutralProgress}/100)`}` : "—"],
    ["עיניים (EAR)", d?.ear != null ? `${d.ear}${d.neutral?.ear != null ? ` (רגיל: ${d.neutral.ear})` : ""} · עצומות=${String(d.eyesClosed)}` : "—"],
    ["מסתכלת הצידה", d ? `${String(d.lookingAway)}${d.gazeFor ? ` · כבר ${d.gazeFor} שנ'` : ""} · מעל 4 שנ'=${String(engine.gaze?.sustained ?? false)}` : "—"],
    ["אין פנים ברצף", noFaceFor ? `${noFaceFor} שנ' (מעל 5 = נכנס לחוב)` : "0"],
    ["אתחולים מחדש אחרי שגיאת זיהוי", d ? d.recreations : "—"],
    ["ציון ראשוני (חלון חלקי)", engine.provisional ? `כן (${engine.framesFilled} פריימים)` : "לא"],
    ["שגיאה אחרונה", d?.lastError ? `${d.lastErrorAt}: ${d.lastError}` : cam.error || engine.error || "אין"],
  ];
  return (
    <section className="card debug-panel" aria-labelledby="debug-title" data-testid="debug-panel">
      <h2 id="debug-title">🛠 פאנל דיבאג</h2>
      <table className="data small">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}><th scope="row">{k}</th><td dir="auto">{String(v)}</td></tr>
          ))}
        </tbody>
      </table>
      <ul className="small" style={{ margin: "10px 0" }}>
        {hints(d, cam, track).map((h) => <li key={h}>{h}</li>)}
      </ul>
      <div className="row">
        <button type="button" className="btn btn-primary" onClick={copy} data-testid="copy-diagnostics">📋 העתקת אבחון</button>
        {copied === "ok" && <span className="small" role="status">האבחון הועתק. אפשר להדביק אותו בהודעה.</span>}
      </div>
      {copied && copied !== "ok" && (
        <label className="small">
          ההעתקה האוטומטית נכשלה. סמני והעתיקי:
          <textarea readOnly rows={8} value={copied} dir="ltr" style={{ width: "100%" }} />
        </label>
      )}
      <div className="row small">
        <span>להשוואה (טוען מחדש את הדף):</span>
        <a href={withParams({ gpu: "1" })}>gpu=1</a>
        <a href={withParams({ input: "video" })}>input=video</a>
        <a href={withParams({ input: null, gpu: null })}>ברירת מחדל (CPU, העתקת פריים)</a>
      </div>
    </section>
  );
}
