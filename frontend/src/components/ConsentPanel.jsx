import { useEffect, useState } from "react";
import { listCameras } from "../focus/camera.js";

/** Step 2: explain what is collected, pick a camera, and turn it on only after an explicit click. */
export default function ConsentPanel({ onEnable, onSkip, starting, error, refreshKey }) {
  const [cameras, setCameras] = useState([]);
  const [deviceId, setDeviceId] = useState("");

  useEffect(() => {
    listCameras()
      .then((list) => {
        setCameras(list);
        setDeviceId((cur) => (list.some((c) => c.deviceId === cur) ? cur : list[0]?.deviceId ?? ""));
      })
      .catch(() => setCameras([]));
  }, [refreshKey]);

  return (
    <section className="card" aria-labelledby="consent-title">
      <h2 id="consent-title" className="card-title"><span className="step-badge">2</span>הפעלת מצלמה</h2>
      <p>
        כדי למדוד ריכוז, Rewind משתמש במצלמה. <strong>הווידאו לא יוצא מהמחשב שלך.</strong> הדפדפן מזהה נקודות על
        הפנים, ומודל קטן מחשב מהן ציון ריכוז בין 0 ל-1. לשרת נשלח רק הציון.
      </p>
      {error && (
        <div className="msg msg-warning" role="alert">{error}</div>
      )}
      <div className="field">
        <label htmlFor="camera-select">בחירת מצלמה</label>
        <select id="camera-select" value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
          {cameras.length === 0 && <option value="">מצלמת ברירת המחדל</option>}
          {cameras.map((c) => (
            <option key={c.deviceId || c.label} value={c.deviceId}>{c.label}</option>
          ))}
        </select>
        <div className="field-hint">שמות המצלמות מופיעים אחרי שמאשרים גישה. אפשר לבחור גם מצלמה וירטואלית (OBS).</div>
      </div>
      <div className="row">
        <button type="button" className="btn btn-mint btn-lg" disabled={starting} onClick={() => onEnable(deviceId)}>
          📷 {starting ? "מפעילה מצלמה..." : error ? "ניסיון חוזר" : "הפעלת מצלמה"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onSkip}>המשך בלי מצלמה</button>
      </div>
    </section>
  );
}
