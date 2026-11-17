import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api/client.js";
import EmptyState from "../components/EmptyState.jsx";
import Spinner from "../components/Spinner.jsx";
import { formatDateTime, formatDebt, formatDuration, formatScore, MODE_LABELS, scoreColor, TYPE_LABELS } from "../utils/format.js";

const COLORS = { ink: "#1d2b44", mint: "#2fa37a", coral: "#e0584b" };

export default function History() {
  const [sessions, setSessions] = useState(null);
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    document.title = "היסטוריה · Rewind";
    api("/sessions").then(setSessions).catch((e) => setError(e.message));
    api(`/analytics/overview?tz_offset_minutes=${new Date().getTimezoneOffset()}`).then(setOverview).catch(() => {});
  }, []);

  const trend = (overview?.trend ?? []).map((t, i) => ({
    n: i + 1,
    label: new Date(t.started_at).toLocaleDateString("he-IL", { day: "numeric", month: "numeric" }),
    score: t.average_score,
    title: t.content_title,
  }));
  const hours = (overview?.by_hour ?? []).map((h) => ({ hour: `${h.hour}:00`, score: h.average_score, count: h.count }));

  return (
    <div>
      <div className="page-header">
        <h1>היסטוריה</h1>
        <p className="lead">ארכיון ההקלטות שלך: כל הסשנים, המגמה, והתוכן שעוד יש בו חוב קשב.</p>
      </div>
      {error && <div className="msg msg-error" role="alert">{error}</div>}
      {!sessions && !error && <Spinner label="טוענת היסטוריה..." />}

      {sessions && sessions.length === 0 && (
        <EmptyState title="עוד אין הקלטות">
          <p>התחילי סשן מהספרייה, והוא יופיע כאן אחרי הסיום.</p>
          <Link className="btn btn-primary" to="/library">לספרייה</Link>
        </EmptyState>
      )}

      {sessions && sessions.length > 0 && (
        <>
          {overview && (
            <>
              <div className="stats" aria-label="סיכום">
                <div className="stat"><div className="v">{overview.total_sessions}</div><div className="k">סשנים</div></div>
                <div className="stat"><div className="v">{Math.round(overview.total_minutes)}</div><div className="k">דקות למידה</div></div>
                <div className="stat"><div className="v" style={{ color: scoreColor(overview.average_score) }}>{formatScore(overview.average_score)}</div><div className="k">ממוצע כללי</div></div>
                <div className="stat">
                  <div className="v" style={{ color: overview.debt_seconds_total > 0 || overview.debt_paragraphs_total > 0 ? "var(--coral-ink)" : "var(--mint-ink)", fontSize: "1.25rem" }}>
                    {overview.debt_seconds_total > 0 || overview.debt_paragraphs_total > 0
                      ? [overview.debt_seconds_total > 0 && formatDebt(overview.debt_seconds_total, "seconds"),
                         overview.debt_paragraphs_total > 0 && formatDebt(overview.debt_paragraphs_total, "paragraphs")].filter(Boolean).join(" + ")
                      : "0"}
                  </div>
                  <div className="k">חוב פתוח כולל</div>
                </div>
              </div>

              <div className="charts">
                <section className="card">
                  <h2>הריכוז שלך לאורך זמן</h2>
                  <p className="small muted">ציון ממוצע לכל סשן, מהישן לחדש. הקו המקווקו הוא סף ההתראה (0.4).</p>
                  <div className="chart-box">
                    <ResponsiveContainer>
                      <LineChart data={trend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5ded2" />
                        <XAxis dataKey="label" fontSize={12} />
                        <YAxis domain={[0, 1]} fontSize={12} />
                        <Tooltip formatter={(v) => [formatScore(v), "ציון ממוצע"]} labelFormatter={(l, p) => p?.[0]?.payload?.title ?? l} />
                        <ReferenceLine y={0.4} stroke={COLORS.coral} strokeDasharray="4 4" />
                        <Line type="monotone" dataKey="score" stroke={COLORS.ink} strokeWidth={2.5} dot={{ r: 4, fill: COLORS.mint }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </section>
                <section className="card">
                  <h2>השעה הכי טובה שלך</h2>
                  <p className="small muted">
                    {overview.best_hour !== null
                      ? <>הריכוז הממוצע הכי גבוה שלך היה בסביבות <strong>{overview.best_hour}:00</strong>.</>
                      : "עוד אין מספיק מדידות."}
                  </p>
                  <div className="chart-box">
                    <ResponsiveContainer>
                      <BarChart data={hours} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5ded2" />
                        <XAxis dataKey="hour" fontSize={12} />
                        <YAxis domain={[0, 1]} fontSize={12} />
                        <Tooltip formatter={(v) => [formatScore(v), "ציון ממוצע"]} />
                        <Bar dataKey="score" fill={COLORS.mint} radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>
              </div>

              {overview.debt_items.length > 0 && (
                <section className="card" aria-labelledby="debt-items-title" style={{ marginBottom: 16 }}>
                  <h2 id="debt-items-title">תוכן עם חוב פתוח</h2>
                  <p className="small muted">אחוז ההשלמה בריכוז = כמה מהתוכן כבר נצפה או נקרא בקשב (כולל מעברים שניים).</p>
                  {overview.debt_items.map((d) => (
                    <div className="debt-item" key={d.content_id}>
                      <div className="grow">
                        <strong>{d.title}</strong>
                        <div className="small muted">{TYPE_LABELS[d.type]} · חוב: {formatDebt(d.debt_total, d.debt_unit)}</div>
                      </div>
                      <div className="completion">
                        <div className="small">הושלם בריכוז: {d.completion === null ? "—" : `${Math.round(d.completion * 100)}%`}</div>
                        <div className="progress" role="progressbar" aria-label={`אחוז השלמה בריכוז: ${d.title}`}
                          aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((d.completion ?? 0) * 100)}>
                          <span style={{ width: `${(d.completion ?? 0) * 100}%` }} />
                        </div>
                      </div>
                      <Link className="btn btn-primary btn-sm" to={`/content/${d.content_id}?review=${d.review_session_id}`}>⏪ השלמת חוב (מעבר שני)</Link>
                    </div>
                  ))}
                </section>
              )}
            </>
          )}

          <section aria-labelledby="sessions-title">
            <h2 id="sessions-title">כל הסשנים</h2>
            <div className="table-wrap card" style={{ padding: 0 }}>
              <table className="data responsive">
                <thead>
                  <tr>
                    <th scope="col">תאריך</th>
                    <th scope="col">תוכן</th>
                    <th scope="col">ציון ממוצע</th>
                    <th scope="col">סוג</th>
                    <th scope="col">משך</th>
                    <th scope="col">חוב קשב</th>
                    <th scope="col"><span className="sr-only">פעולות</span></th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr key={s.id}>
                      <td data-label="תאריך">{formatDateTime(s.started_at)}</td>
                      <td data-label="תוכן">{s.content_title}</td>
                      <td data-label="ציון ממוצע">
                        <span className="score-cell">
                          <strong>{formatScore(s.average_score)}</strong>
                          {s.average_score !== null && (
                            <span className="mini-bar" aria-hidden="true">
                              <span style={{ width: `${s.average_score * 100}%`, background: scoreColor(s.average_score) }} />
                            </span>
                          )}
                        </span>
                      </td>
                      <td data-label="סוג">{MODE_LABELS[s.mode]}</td>
                      <td data-label="משך">{s.ended_at ? formatDuration(s.started_at, s.ended_at) : "פתוח"}</td>
                      <td data-label="חוב קשב">{s.mode === "review" ? "—" : formatDebt(s.debt_seconds, s.debt_unit)}</td>
                      <td data-label="">
                        <Link className="btn btn-sm" to={`/sessions/${s.id}`} aria-label={`פרטים על הסשן של ${s.content_title}`}>פרטים</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
