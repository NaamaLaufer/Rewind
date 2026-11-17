import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api/client.js";
import AlertBanner from "../components/AlertBanner.jsx";
import BreakDialog from "../components/BreakDialog.jsx";
import ConsentPanel from "../components/ConsentPanel.jsx";
import DebtMeter from "../components/DebtMeter.jsx";
import FocusTape from "../components/FocusTape.jsx";
import QuestionDialog from "../components/QuestionDialog.jsx";
import Reader from "../components/Reader.jsx";
import ScoreCard from "../components/ScoreCard.jsx";
import Spinner from "../components/Spinner.jsx";
import YouTubePlayer from "../components/YouTubePlayer.jsx";
import { cameraErrorMessage, openCamera, stopStream } from "../focus/camera.js";
import { computeMissedSegments, totalDebt } from "../focus/liveDebt.js";
import { initialAlertState, returnPoint, stepAlert } from "../focus/smoothing.js";
import { preloadFocusEngine, useFocusEngine } from "../focus/useFocusEngine.js";
import { formatDebt, formatScore, formatSegment, TYPE_LABELS } from "../utils/format.js";
import NotFound from "./NotFound.jsx";

const SHORT_SEGMENT = 12; // seconds: shorter than one model window -> may have no reading inside

export default function ContentView() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();

  const [content, setContent] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [debt, setDebt] = useState(null);
  const [aiEnabled, setAiEnabled] = useState(false);

  const [phase, setPhase] = useState("idle"); // idle | active | summary
  const [session, setSession] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [summary, setSummary] = useState(null);

  const [cam, setCam] = useState({ status: "off", error: null }); // off|consent|starting|on|skipped
  const [camRefresh, setCamRefresh] = useState(0);
  const streamRef = useRef(null);
  const videoRef = useRef(null);

  const [readings, setReadings] = useState([]);
  const [noFaceMarks, setNoFaceMarks] = useState([]);
  const [alert, setAlert] = useState(null); // {returnTo}
  const alertState = useRef(initialAlertState());
  const [breakOpen, setBreakOpen] = useState(false);
  const [question, setQuestion] = useState(null); // paragraph index
  const [measureStopped, setMeasureStopped] = useState(null);
  const [playhead, setPlayhead] = useState(null);
  const [duration, setDuration] = useState(null);

  // Second Pass
  const [segIdx, setSegIdx] = useState(0);
  const [reviewRunning, setReviewRunning] = useState(false);
  const [showAllText, setShowAllText] = useState(false);
  const segFaceLost = useRef(false);

  const playerRef = useRef(null);
  const readerRef = useRef(null);
  const sessionRef = useRef(null);
  sessionRef.current = phase === "active" ? session : null;
  const readingsRef = useRef(readings);
  readingsRef.current = readings;

  const isVideo = content?.type === "youtube";
  const unit = isVideo ? "seconds" : "paragraphs";
  const isReview = session?.mode === "review";
  const reviewSegs = session?.review_segments ?? [];

  // ---------- loading ----------
  const loadDebt = useCallback(() => {
    api(`/content/${id}/debt`).then(setDebt).catch(() => {});
  }, [id]);

  useEffect(() => {
    setContent(null);
    setNotFound(false);
    api(`/content/${id}`)
      .then((c) => {
        setContent(c);
        setDuration(c.duration_seconds);
        document.title = `${c.title} · Rewind`;
        if (c.type !== "youtube") api("/ai/status").then((s) => setAiEnabled(s.enabled)).catch(() => {});
      })
      .catch((e) => (e.status === 404 ? setNotFound(true) : setLoadError(e.message)));
    loadDebt();
  }, [id, loadDebt]);

  const getPosition = useCallback(() => {
    if (content?.type === "youtube") return Math.round((playerRef.current?.getCurrentTime() ?? 0) * 10) / 10;
    return readerRef.current?.getPosition() ?? 0;
  }, [content]);

  const seek = useCallback((pos) => {
    if (content?.type === "youtube") {
      playerRef.current?.seekTo(pos);
      playerRef.current?.play();
    } else {
      readerRef.current?.scrollToParagraph(pos);
    }
  }, [content]);

  // ---------- camera ----------
  const stopCamera = useCallback(() => {
    stopStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const enableCamera = async (deviceId) => {
    setCam({ status: "starting", error: null });
    try {
      const stream = await openCamera(deviceId);
      streamRef.current = stream;
      setCam({ status: "on", error: null });
      setCamRefresh((k) => k + 1); // labels are only available after permission
      if (!isReview) playerRef.current?.play(); // measuring started -> start the video too
    } catch (e) {
      setCam({ status: "consent", error: cameraErrorMessage(e) });
    }
  };

  useEffect(() => {
    if (cam.status === "on" && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [cam.status]);

  // ---------- measurement ----------
  const postReading = useCallback(async (sid, body) => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await api(`/sessions/${sid}/readings`, { method: "POST", body });
        return;
      } catch (e) {
        if (e.status === 409) {
          setMeasureStopped("הסשן כבר נסגר, אז המדידה נעצרה.");
          stopCamera();
          setCam({ status: "off", error: null });
          return;
        }
        if (e.status && e.status !== 0 && e.status < 500) return; // 4xx: retrying won't help
      }
    }
  }, [stopCamera]);

  const onScore = useCallback((r) => {
    const s = sessionRef.current;
    if (!s) return;
    const reading = {
      position: getPosition(),
      score: Math.round(r.score * 10000) / 10000,
      smoothed: Math.round(r.smoothed * 10000) / 10000,
      level: r.level,
      attention_peak: r.attentionPeak === null ? null : Math.round(r.attentionPeak * 1000) / 1000,
    };
    const all = [...readingsRef.current, reading];
    setReadings(all);
    postReading(s.id, reading);

    const step = stepAlert(alertState.current, reading.smoothed, Date.now());
    alertState.current = step.state;
    if (step.fireAlert) setAlert({ returnTo: returnPoint(all, s.debt_unit_hint) });
  }, [getPosition, postReading]);

  const engine = useFocusEngine({ videoRef, enabled: phase === "active" && cam.status === "on", onScore });

  // Warm up MediaPipe + the model as soon as a session starts (the user is reading the consent card).
  useEffect(() => {
    if (phase === "active") preloadFocusEngine();
  }, [phase]);

  // Gray "no face" marks on the tape, one every 2s while no face is detected.
  useEffect(() => {
    if (!engine.noFace || phase !== "active") return undefined;
    segFaceLost.current = true;
    const mark = () => setNoFaceMarks((m) => [...m, getPosition()]);
    mark();
    const t = setInterval(mark, 2000);
    return () => clearInterval(t);
  }, [engine.noFace, phase, getPosition]);

  // Playhead on the tape.
  useEffect(() => {
    if (!content) return undefined;
    const t = setInterval(() => setPlayhead(getPosition()), 500);
    return () => clearInterval(t);
  }, [content, getPosition]);

  // ---------- session lifecycle ----------
  const resetLive = () => {
    setReadings([]);
    setNoFaceMarks([]);
    setAlert(null);
    alertState.current = initialAlertState();
    setMeasureStopped(null);
    setSummary(null);
    setSegIdx(0);
    setReviewRunning(false);
    setShowAllText(false);
  };

  const startSession = async (mode = "watch", reviewOf = null) => {
    setBusy(true);
    setActionError(null);
    try {
      const body = { content_id: id, mode };
      if (reviewOf) body.review_of = reviewOf;
      const s = await api("/sessions", { method: "POST", body });
      resetLive();
      setSession({ ...s, debt_unit_hint: unit });
      setPhase("active");
      setCam((c) => (c.status === "on" ? c : { status: "consent", error: null }));
      if (params.get("review")) setParams({}, { replace: true });
    } catch (e) {
      setActionError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const endSession = useCallback(async () => {
    const s = sessionRef.current;
    if (!s) return;
    setBusy(true);
    setActionError(null);
    playerRef.current?.pause();
    stopCamera();
    setCam({ status: "off", error: null });
    try {
      const res = await api(`/sessions/${s.id}/end`, { method: "POST" });
      setSummary(res);
      setPhase("summary");
      setAlert(null);
      loadDebt();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setActionError(e.message);
    } finally {
      setBusy(false);
    }
  }, [stopCamera, loadDebt]);

  // Leaving the page mid-session: best-effort /end with keepalive + stop the camera.
  useEffect(() => {
    const onUnload = () => {
      const s = sessionRef.current;
      if (s) api(`/sessions/${s.id}/end`, { method: "POST", keepalive: true }).catch(() => {});
    };
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      onUnload();
      stopStream(streamRef.current);
    };
  }, []);

  // ---------- Second Pass (YouTube): play only the missed segments, one after another ----------
  const currentSeg = isReview ? reviewSegs[segIdx] : null;

  // Start playback once the camera produced a first score (or measurement is off).
  useEffect(() => {
    if (!isReview || phase !== "active" || reviewRunning) return;
    const ready = cam.status === "skipped" || (cam.status === "on" && engine.score !== null);
    if (ready) setReviewRunning(true);
  }, [isReview, phase, reviewRunning, cam.status, engine.score]);

  useEffect(() => {
    if (!isReview || !reviewRunning || !currentSeg) return;
    segFaceLost.current = cam.status !== "on";
    if (isVideo) {
      playerRef.current?.seekTo(currentSeg.start);
      playerRef.current?.play();
    } else {
      readerRef.current?.scrollToParagraph(currentSeg.start);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReview, reviewRunning, segIdx]);

  const nextSegment = useCallback(async () => {
    const s = sessionRef.current;
    const seg = reviewSegs[segIdx];
    if (!s || !seg) return;
    // A short segment may contain no reading at all -> tell the server it was watched with a face.
    if (isVideo && seg.end - seg.start < SHORT_SEGMENT && cam.status === "on" && !segFaceLost.current) {
      api(`/sessions/${s.id}/segments/${seg.idx}/watched`, { method: "POST" }).catch(() => {});
    }
    if (segIdx + 1 < reviewSegs.length) setSegIdx(segIdx + 1);
    else endSession();
  }, [reviewSegs, segIdx, isVideo, cam.status, endSession]);

  useEffect(() => {
    if (!isReview || !reviewRunning || !isVideo || !currentSeg || phase !== "active") return undefined;
    const t = setInterval(() => {
      const now = playerRef.current?.getCurrentTime() ?? 0;
      if (now >= currentSeg.end - 0.25) nextSegment();
    }, 250);
    return () => clearInterval(t);
  }, [isReview, reviewRunning, isVideo, currentSeg, phase, nextSegment]);

  // ---------- derived ----------
  const liveSegments = useMemo(
    () => (session?.mode === "watch" ? computeMissedSegments(readings, unit) : []),
    [readings, unit, session],
  );
  const liveDebt = totalDebt(liveSegments, unit);
  const openDebtSegs = (debt?.open_segments ?? []).map((s) => ({ start: s.start, end: s.end, closed: false }));

  const heatAvg = useMemo(() => {
    const b = {};
    for (const r of readings) {
      const i = Math.floor(r.position);
      (b[i] ??= []).push(r.smoothed ?? r.score);
    }
    return Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.reduce((a, c) => a + c, 0) / v.length]));
  }, [readings]);

  const debtSet = useMemo(() => {
    const set = new Set();
    const segs = phase === "summary" && summary?.mode === "watch" ? summary.missed_segments.filter((s) => !s.closed) : [...openDebtSegs, ...liveSegments];
    if (unit === "paragraphs") for (const s of segs) for (let i = s.start; i <= s.end; i++) set.add(i);
    return set;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debt, liveSegments, summary, phase, unit]);

  const visibleParas = useMemo(() => {
    if (!isReview || phase !== "active" || showAllText || unit !== "paragraphs") return null;
    const set = new Set();
    for (const s of reviewSegs) for (let i = s.start; i <= s.end; i++) set.add(i);
    return set;
  }, [isReview, phase, showAllText, unit, reviewSegs]);

  let tapeSegments = openDebtSegs;
  if (phase === "active") tapeSegments = isReview ? reviewSegs.map((s) => ({ ...s, closed: false })) : liveSegments;
  if (phase === "summary" && summary) tapeSegments = summary.mode === "watch" ? summary.missed_segments : reviewSegs;

  const contentLength = isVideo ? duration : content?.body_paragraphs?.length;

  // ---------- render ----------
  if (notFound) return <NotFound message="הפריט לא קיים או שאין לך גישה אליו." />;
  if (loadError) return <div className="msg msg-error" role="alert">{loadError}</div>;
  if (!content) return <Spinner label="טוענת את התוכן..." />;

  const reviewParam = params.get("review");
  const handleDuration = (d) => {
    setDuration(d);
    if (!content.duration_seconds) {
      content.duration_seconds = d;
      api(`/content/${id}`, { method: "PATCH", body: { duration_seconds: Math.round(d * 10) / 10 } }).catch(() => {});
    }
  };

  return (
    <div>
      <div className="page-header">
        <p className="small" style={{ margin: 0 }}><Link to="/library">→ חזרה לספרייה</Link></p>
        <h1>{content.title}</h1>
        <div className="content-meta">
          <span className="tag">{TYPE_LABELS[content.type]}</span>
          {debt && debt.debt_total > 0 && <span className="tag tag-debt">חוב פתוח: {formatDebt(debt.debt_total, debt.debt_unit)}</span>}
          {debt?.completion !== null && debt?.completion !== undefined && (
            <span className="tag">הושלם בריכוז: {Math.round(debt.completion * 100)}%</span>
          )}
          {content.type === "web" && (
            <span className="small">
              מקור: {content.site_name} · <a href={content.source} target="_blank" rel="noopener noreferrer">פתיחת הדף המקורי בחלון חדש</a>
            </span>
          )}
        </div>
      </div>

      <div className="view-layout">
        {/* ---- content (right) ---- */}
        <div>
          {isReview && phase === "active" && (
            <div className="msg msg-info" role="status">
              <strong>מעבר שני: קטע {Math.min(segIdx + 1, reviewSegs.length)} מתוך {reviewSegs.length}</strong>
              {currentSeg && <> · {formatSegment(currentSeg, unit)}</>}
              {!reviewRunning && " · מחכה לציון הראשון מהמצלמה לפני שמתחילים (כ-10 שניות)"}
            </div>
          )}
          {isVideo ? (
            <YouTubePlayer ref={playerRef} videoId={content.youtube_id} onDuration={handleDuration} />
          ) : (
            <>
              {isReview && phase === "active" && (
                <div className="row" style={{ marginBottom: 10 }}>
                  <button type="button" className="btn btn-sm" onClick={() => setShowAllText((v) => !v)}>
                    {showAllText ? "הצגת הפסקאות שבחוב בלבד" : "הצגת כל הטקסט"}
                  </button>
                </div>
              )}
              <Reader ref={readerRef} paragraphs={content.body_paragraphs ?? []} heatAvg={heatAvg}
                debtSet={debtSet} visible={visibleParas} />
            </>
          )}
          <FocusTape readings={readings} noFaceMarks={noFaceMarks} length={contentLength} unit={unit}
            segments={tapeSegments} playhead={playhead} onSeek={seek}
            title={isReview && phase === "active" ? "סרט הקשב: מעבר שני" : "סרט הקשב"} />
        </div>

        {/* ---- focus panel (left) ---- */}
        <aside className="focus-panel" aria-label="פאנל ריכוז">
          {actionError && <div className="msg msg-error" role="alert">{actionError}</div>}

          {phase === "idle" && (
            <>
              {reviewParam ? (
                <section className="card" aria-labelledby="start-title">
                  <h2 id="start-title" className="card-title"><span className="step-badge">1</span>מעבר שני</h2>
                  <p>נצפה <strong>רק</strong> בקטעים שפספסת, אחד אחרי השני. קטע שתצפי בו בריכוז ייסגר והחוב ירד.</p>
                  <div className="row">
                    <button type="button" className="btn btn-primary btn-lg" disabled={busy} onClick={() => startSession("review", reviewParam)}>
                      ⏪ {busy ? "פותחת..." : "התחלת מעבר שני"}
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={() => setParams({}, { replace: true })}>צפייה רגילה במקום</button>
                  </div>
                </section>
              ) : (
                <section className="card" aria-labelledby="start-title">
                  <h2 id="start-title" className="card-title"><span className="step-badge">1</span>התחלת סשן</h2>
                  <p>סשן הוא צפייה או קריאה אחת בפריט, עם מדידת ריכוז דרך המצלמה. בסוף הוא נשמר בהיסטוריה.</p>
                  <button type="button" className="btn btn-primary btn-lg btn-block" disabled={busy} onClick={() => startSession("watch")}>
                    ▶ {busy ? "פותחת סשן..." : "התחלת סשן"}
                  </button>
                </section>
              )}
              {!reviewParam && debt?.open_segments?.length > 0 && (
                <section className="card">
                  <h2>יש לך חוב קשב בפריט הזה</h2>
                  <p>{formatDebt(debt.debt_total, debt.debt_unit)} שעוד לא נצפו בריכוז.</p>
                  <button type="button" className="btn btn-block" disabled={busy}
                    onClick={() => startSession("review", debt.open_segments[0].session_id)}>
                    ⏪ השלמת חוב (מעבר שני)
                  </button>
                </section>
              )}
            </>
          )}

          {phase === "active" && (
            <>
              {alert && (
                <AlertBanner unit={unit} returnTo={alert.returnTo} aiEnabled={aiEnabled}
                  onReturn={() => { seek(alert.returnTo); setAlert(null); }}
                  onBreak={() => { playerRef.current?.pause(); setBreakOpen(true); setAlert(null); }}
                  onQuestion={() => { setQuestion(Math.floor(alert.returnTo)); setAlert(null); }}
                  onClose={() => setAlert(null)} />
              )}

              {(cam.status === "consent" || cam.status === "starting") && (
                <ConsentPanel starting={cam.status === "starting"} error={cam.error} refreshKey={camRefresh}
                  onEnable={enableCamera}
                  onSkip={() => { setCam({ status: "skipped", error: null }); if (!isReview) playerRef.current?.play(); }} />
              )}

              {cam.status === "skipped" && (
                <section className="card">
                  <h2>המדידה כבויה</h2>
                  <p>הסשן ממשיך בלי מצלמה, ולכן אין ציון ריכוז. אפשר להפעיל מצלמה בכל רגע.</p>
                  <button type="button" className="btn btn-mint" onClick={() => setCam({ status: "consent", error: null })}>📷 הפעלת מצלמה</button>
                </section>
              )}

              {measureStopped && <div className="msg msg-warning" role="alert">{measureStopped}</div>}

              {cam.status === "on" && (
                <>
                  {engine.noFace && (
                    <div className="noface-banner" role="alert" data-testid="no-face">
                      ⚠️ לא זוהו פנים. ודאי שהפנים שלך מול המצלמה ובתאורה טובה.
                    </div>
                  )}
                  {engine.paused && <div className="msg msg-info" role="status">המדידה מושהית כשהלשונית לא פעילה.</div>}
                  {engine.status === "loading" && <div className="msg msg-info" role="status">טוענת את מודל הריכוז (פעם ראשונה עשויה לקחת כמה שניות)...</div>}
                  {engine.status === "error" && <div className="msg msg-error" role="alert">{engine.error}</div>}
                  {engine.detectError && <div className="msg msg-error" role="alert" data-testid="detect-error">{engine.detectError}</div>}                  <ScoreCard score={engine.score} smoothed={engine.smoothed} modelLevel={engine.level}
                    framesFilled={engine.framesFilled} noFace={engine.noFace} fps={engine.fps} detectMs={engine.detectMs} />
                </>
              )}
              <div className={cam.status === "on" ? "card" : "cam-hidden"} style={cam.status === "on" ? { padding: 12 } : undefined}>
                <div className="cam-preview">
                  <video ref={videoRef} muted playsInline autoPlay aria-label="תצוגה מקדימה של המצלמה" />
                  <span className="cam-label">רק את רואה את זה</span>
                </div>
              </div>

              {isReview ? (
                <section className="card">
                  <h2>מעבר שני</h2>
                  <p>קטע {Math.min(segIdx + 1, reviewSegs.length)} מתוך {reviewSegs.length}. קטע שתצפי בו בריכוז (ממוצע 0.50 ומעלה) ייסגר.</p>
                  {isVideo && (
                    <div className="row">
                      {!reviewRunning && <button type="button" className="btn" onClick={() => setReviewRunning(true)}>להתחיל עכשיו</button>}
                      {reviewRunning && segIdx + 1 < reviewSegs.length && <button type="button" className="btn" onClick={nextSegment}>לקטע הבא ⏭</button>}
                    </div>
                  )}
                </section>
              ) : (
                <DebtMeter value={liveDebt} unit={unit} />
              )}

              <button type="button" className="btn btn-danger btn-lg btn-block" style={{ marginTop: 16 }} disabled={busy} onClick={endSession}>
                ⏹ {busy ? "שומרת..." : isReview ? "סיום מעבר שני" : "סיום סשן"}
              </button>
            </>
          )}

          {phase === "summary" && summary && (
            <Summary summary={summary} unit={unit} sessionId={session.id} reviewOf={session.review_of}
              busy={busy} onReview={(sid) => startSession("review", sid)} onAgain={() => { setPhase("idle"); resetLive(); }}
              navigate={navigate} />
          )}
        </aside>
      </div>

      {breakOpen && <BreakDialog onDone={() => setBreakOpen(false)} />}
      {question !== null && <QuestionDialog contentId={id} paragraphIndex={question} onClose={() => setQuestion(null)} />}
    </div>
  );
}

function Summary({ summary, unit, sessionId, reviewOf, busy, onReview, onAgain }) {
  if (summary.mode === "review") {
    const remaining = summary.debt_remaining ?? 0;
    return (
      <section className="card" aria-labelledby="sum-title" role="status">
        <h2 id="sum-title">המעבר השני נשמר ✓</h2>
        <p style={{ fontSize: "1.15rem" }}>
          סגרת <strong>{summary.segments_closed ?? 0}</strong> מתוך <strong>{summary.segments_total ?? 0}</strong> קטעים.{" "}
          {remaining > 0 ? <>נשאר חוב של <strong>{formatDebt(remaining, unit)}</strong>.</> : <>החוב נסגר לגמרי! 🎉</>}
        </p>
        <dl className="kv">
          <dt>ציון ממוצע</dt><dd>{formatScore(summary.average_score)}</dd>
          <dt>מדידות</dt><dd>{summary.reading_count}</dd>
        </dl>
        <div className="stack" style={{ marginTop: 16 }}>
          {remaining > 0 && (
            <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={() => onReview(reviewOf)}>⏪ סבב נוסף של מעבר שני</button>
          )}
          <Link className="btn btn-block" to={`/sessions/${sessionId}`}>לפרטי הסשן</Link>
          <Link className="btn btn-block" to="/history">להיסטוריה</Link>
          <Link className="btn btn-block btn-ghost" to="/library">חזרה לספרייה</Link>
        </div>
      </section>
    );
  }
  const debt = summary.debt_seconds;
  return (
    <section className="card" aria-labelledby="sum-title" role="status">
      <h2 id="sum-title">הסשן נשמר ✓</h2>
      <dl className="kv">
        <dt>ציון ממוצע</dt><dd data-testid="summary-average">{formatScore(summary.average_score)}</dd>
        <dt>מספר מדידות</dt><dd>{summary.reading_count}</dd>
        <dt>חוב קשב</dt><dd>{formatDebt(debt, unit)}</dd>
      </dl>
      {summary.reading_count === 0 && <p className="small muted">לא נאספו מדידות בסשן הזה (המצלמה לא הופעלה, או שלא זוהו פנים).</p>}
      {summary.missed_segments.length > 0 && (
        <>
          <h3 style={{ marginTop: 12 }}>קטעים שהוחמצו</h3>
          <ul className="summary-list">
            {summary.missed_segments.map((s, i) => <li key={i}>⏪ {formatSegment(s, unit)}</li>)}
          </ul>
        </>
      )}
      <div className="stack" style={{ marginTop: 16 }}>
        {debt > 0 ? (
          <button type="button" className="btn btn-primary btn-block btn-lg" disabled={busy} onClick={() => onReview(sessionId)}>
            ⏪ מעבר שני: לצפות רק במה שפספסתי ({formatDebt(debt, unit)})
          </button>
        ) : (
          summary.reading_count > 0 && <p className="msg msg-success">כל הכבוד! צפית בכל התוכן בריכוז 🎉</p>
        )}
        <Link className="btn btn-block" to={`/sessions/${sessionId}`}>לפרטי הסשן</Link>
        <Link className="btn btn-block" to="/history">להיסטוריה</Link>
        <button type="button" className="btn btn-block" onClick={onAgain}>סשן חדש על אותו תוכן</button>
        <Link className="btn btn-block btn-ghost" to="/library">חזרה לספרייה</Link>
      </div>
    </section>
  );
}
