import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api/client.js";
import Spinner from "../components/Spinner.jsx";
import { formatDateTime, formatDebt, formatDuration, formatScore, formatSegment, MODE_LABELS, mmss, scoreColor } from "../utils/format.js";
import { LEVEL_LABELS } from "../utils/levels.js";
import NotFound from "./NotFound.jsx";

export default function SessionDetail() {
  const { id } = useParams();
  const [s, setS] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api(`/sessions/${id}`)
      .then((d) => {
        setS(d);
        document.title = `סשן: ${d.content_title} · Rewind`;
      })
      .catch((e) => (e.status === 404 ? setNotFound(true) : setError(e.message)));
  }, [id]);

  if (notFound) return <NotFound message="הסשן לא קיים או שאין לך גישה אליו." />;
  if (error) return <div className="msg msg-error" role="alert">{error}</div>;
  if (!s) return <Spinner label="טוענת את הסשן..." />;

  const unit = s.debt_unit;
  const isText = unit === "paragraphs";
  const posLabel = (p) => (isText ? `פסקה ${Math.floor(p) + 1}` : mmss(p));
  // X axis = time since the session started (always increases, even if the video was paused).
  const t0 = new Date(s.started_at).getTime();
  const chart = s.readings.map((r) => ({
    t: mmss((new Date(r.created_at).getTime() - t0) / 1000),
    pos: posLabel(r.position),
    score: r.score,
    smoothed: r.smoothed,
  }));
  const openSegs = s.missed_segments.filter((x) => !x.closed);
  // personal threshold after calibration = the last threshold the client used (D-045); legacy: 0.40
  const personalTh = [...s.readings].reverse().find((r) => r.threshold != null)?.threshold ?? 0.4;
  const awayCount = s.readings.filter((r) => r.looking_away).length;

  // "What the model saw": where inside each 10-second window the most influential frame was.
  const bins = Array.from({ length: 10 }, (_, b) => ({ label: `${b}–${b + 1} שנ׳`, count: 0 }));
  for (const r of s.readings) if (r.attention_peak !== null && r.attention_peak !== undefined) bins[Math.min(9, Math.floor(r.attention_peak * 10))].count += 1;
  const withPeak = s.readings.filter((r) => r.attention_peak !== null && r.attention_peak !== undefined).length;
  const recentShare = withPeak ? bins.slice(7).reduce((a, b) => a + b.count, 0) / withPeak : 0;

  return (
    <div>
      <div className="page-header">
        <p className="small" style={{ margin: 0 }}><Link to="/history">→ חזרה להיסטוריה</Link></p>
        <h1>{s.content_title}</h1>
        <p className="lead">{MODE_LABELS[s.mode]} · {formatDateTime(s.started_at)}</p>
      </div>

      <div className="stats">
        <div className="stat"><div className="v" style={{ color: scoreColor(s.average_score) }}>{formatScore(s.average_score)}</div><div className="k">ציון ממוצע</div></div>
        <div className="stat"><div className="v">{s.reading_count}</div><div className="k">מדידות</div></div>
        <div className="stat"><div className="v">{s.ended_at ? formatDuration(s.started_at, s.ended_at) : "פתוח"}</div><div className="k">משך</div></div>
        <div className="stat">
          <div className="v" style={{ color: s.mode === "watch" && s.debt_seconds > 0 ? "var(--coral-ink)" : "var(--mint-ink)", fontSize: "1.25rem" }}>
            {s.mode === "review" ? `${s.segments_closed ?? 0}/${s.segments_total ?? 0} נסגרו` : formatDebt(s.debt_seconds, unit)}
          </div>
          <div className="k">{s.mode === "review" ? "קטעים במעבר השני" : "חוב קשב פתוח"}</div>
        </div>
      </div>

      {s.mode === "watch" && s.missed_segments.length > 0 && (
        <section className="card" style={{ marginBottom: 16 }}>
          <h2>קטעים שהוחמצו</h2>
          <ul className="summary-list">
            {s.missed_segments.map((x, i) => (
              <li key={i}>{x.closed ? "✓ נסגר:" : "⏪ פתוח:"} {formatSegment(x, unit)}</li>
            ))}
          </ul>
          {openSegs.length > 0 && s.content_exists && (
            <Link className="btn btn-primary" to={`/content/${s.content_id}?review=${s.id}`}>
              ⏪ מעבר שני: לצפות רק במה שפספסתי ({formatDebt(s.debt_seconds, unit)})
            </Link>
          )}
        </section>
      )}

      <section className="card" style={{ marginBottom: 16 }}>
        <h2>גרף המדידות</h2>
        {s.readings.length === 0 ? (
          <p className="muted">אין מדידות בסשן הזה (המצלמה לא הופעלה או שלא זוהו פנים).</p>
        ) : (
          <>
            <p className="small muted">
              ציון גולמי (מהמודל) וציון מוחלק (EMA) לאורך הסשן. ציר הזמן מתחיל בתחילת הסשן. מתחת לקו המקווקו ({formatScore(personalTh)}) נחשב קשב נמוך
              {personalTh > 0.4 ? " (סף אישי לפי הכיול שלך)" : ""}.
            </p>
            {awayCount > 0 && <p className="small">👀 במדידות {awayCount} זוהה מבט הצידה או עיניים עצומות יותר מ-4 שניות.</p>}
            {(s.no_face_gaps ?? []).length > 0 && (
              <p className="small">🚫 לא זוהו פנים יותר מ-5 שניות ב-{s.no_face_gaps.length} פעמים. הזמן הזה נכנס לחוב הקשב.</p>
            )}
            <div className="chart-box" style={{ height: 300 }}>
              <ResponsiveContainer>
                <LineChart data={chart} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5ded2" />
                  <XAxis dataKey="t" fontSize={12} />
                  <YAxis domain={[0, 1]} fontSize={12} />
                  <Tooltip formatter={(v, n) => [formatScore(v), n === "score" ? "ציון" : "מוחלק"]}
                    labelFormatter={(l, p) => `${l} בסשן · ${p?.[0]?.payload?.pos ?? ""} בתוכן`} />
                  <Legend formatter={(v) => (v === "score" ? "ציון גולמי" : "ציון מוחלק")} />
                  <ReferenceLine y={personalTh} stroke="#e0584b" strokeDasharray="4 4" />
                  <Line type="monotone" dataKey="score" stroke="#9aa3b5" strokeWidth={1.5} dot={false} />
                  <Line type="monotone" dataKey="smoothed" stroke="#1d2b44" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </section>

      {withPeak > 0 && (
        <section className="card" style={{ marginBottom: 16 }}>
          <h2>מה המודל ראה</h2>
          <p>
            מודל v4_7 משתמש במנגנון <strong>Attention</strong>: בכל חלון של 10 שניות (100 פריימים) הוא נותן משקל לכל פריים.
            הגרף מראה <strong>איפה בתוך החלון</strong> היה הרגע שהשפיע הכי הרבה על הציון (0 = תחילת החלון, 10 = הרגע האחרון).
          </p>
          <p className="small muted">
            {Math.round(recentShare * 100)}% מהמדידות הושפעו בעיקר מ-3 השניות האחרונות בחלון.
            {recentShare > 0.5 ? " כלומר המודל מגיב בעיקר למה שקרה ממש עכשיו." : " כלומר המודל מסתכל גם על מה שקרה קודם בחלון."}
          </p>
          <div className="chart-box" style={{ height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={bins} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5ded2" />
                <XAxis dataKey="label" fontSize={11} />
                <YAxis allowDecimals={false} fontSize={12} />
                <Tooltip formatter={(v) => [v, "מדידות"]} />
                <Bar dataKey="count" fill="#2fa37a" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <section className="card" style={{ marginBottom: 16 }}>
        <h2>טבלת מדידות</h2>
        {s.readings.length === 0 ? <p className="muted">אין מדידות.</p> : (
          <div className="table-wrap" style={{ maxHeight: 420, overflowY: "auto" }}>
            <table className="data responsive">
              <thead>
                <tr><th scope="col">#</th><th scope="col">מיקום בתוכן</th><th scope="col">ציון</th><th scope="col">מוחלק</th><th scope="col">רמה (סיווג המודל)</th><th scope="col">זמן</th></tr>
              </thead>
              <tbody>
                {s.readings.map((r, i) => (
                  <tr key={i}>
                    <td data-label="#">{i + 1}</td>
                    <td data-label="מיקום בתוכן">{posLabel(r.position)}</td>
                    <td data-label="ציון" style={{ color: scoreColor(r.score), fontWeight: 600 }}>{formatScore(r.score)}</td>
                    <td data-label="מוחלק">{formatScore(r.smoothed)}</td>
                    <td data-label="רמה">{r.level === null || r.level === undefined ? "—" : LEVEL_LABELS[r.level]}</td>
                    <td data-label="זמן">{new Date(r.created_at).toLocaleTimeString("he-IL")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {s.content_exists ? (
        <Link className="btn btn-primary btn-lg" to={`/content/${s.content_id}`}>המשך ללמוד את התוכן הזה</Link>
      ) : (
        <p className="muted">הפריט הזה נמחק מהספרייה, אבל הסשן נשמר בהיסטוריה.</p>
      )}
    </div>
  );
}
