import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, fieldErrors } from "../api/client.js";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import EmptyState from "../components/EmptyState.jsx";
import Field from "../components/Field.jsx";
import Spinner from "../components/Spinner.jsx";
import { formatDate, TYPE_LABELS } from "../utils/format.js";
import { extractYouTubeId } from "../utils/youtube.js";

const TYPES = [
  { value: "youtube", label: "סרטון YouTube", sourceLabel: "קישור לסרטון YouTube", placeholder: "https://www.youtube.com/watch?v=..." },
  { value: "text", label: "טקסט להדבקה", sourceLabel: "הטקסט", placeholder: "הדביקי כאן מאמר או סיכום. שורה ריקה = פסקה חדשה." },
  { value: "web", label: "דף אינטרנט (קישור)", sourceLabel: "קישור לדף", placeholder: "https://..." },
];
const ICONS = { youtube: "▶", text: "📄", web: "🌐" };

export default function Library() {
  const [items, setItems] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [form, setForm] = useState({ title: "", type: "youtube", source: "" });
  const [errors, setErrors] = useState({});
  const [general, setGeneral] = useState(null);
  const [success, setSuccess] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  useEffect(() => {
    document.title = "הספרייה שלי · Rewind";
    api("/content").then(setItems).catch((e) => setLoadError(e.message));
  }, []);

  const type = TYPES.find((t) => t.value === form.type);

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.title.trim()) errs.title = "נא למלא כותרת";
    if (!form.source.trim()) errs.source = form.type === "text" ? "נא להדביק טקסט" : "נא להדביק קישור";
    else if (form.type === "youtube" && !extractYouTubeId(form.source))
      errs.source = "זה לא נראה כמו קישור לסרטון YouTube. לדוגמה: https://www.youtube.com/watch?v=...";
    else if (form.type === "web" && !/^https?:\/\//i.test(form.source.trim()))
      errs.source = "הקישור צריך להתחיל ב-http:// או https://";
    setErrors(errs);
    setGeneral(null);
    setSuccess(null);
    if (Object.keys(errs).length) return;

    setBusy(true);
    try {
      const item = await api("/content", { method: "POST", body: form });
      setItems((list) => [item, ...(list ?? [])]);
      setForm({ title: "", type: form.type, source: "" });
      setSuccess(`"${item.title}" נוסף לספרייה. אפשר לפתוח אותו ולהתחיל סשן.`);
    } catch (err) {
      const fe = fieldErrors(err);
      if (err.status === 422 && !Object.keys(fe).length) setErrors({ source: err.message });
      else if (Object.keys(fe).length) setErrors(fe);
      else setGeneral(err.message);
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api(`/content/${toDelete.id}`, { method: "DELETE" });
      setItems((list) => list.filter((x) => x.id !== toDelete.id));
      setSuccess(`"${toDelete.title}" נמחק מהספרייה.`);
      setToDelete(null);
    } catch (err) {
      setDeleteError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>הספרייה שלי</h1>
        <p className="lead">כאן נמצא כל מה שאת לומדת. פתחי פריט כדי להתחיל סשן מדידת ריכוז.</p>
      </div>

      <form className="card add-form" onSubmit={submit} noValidate aria-labelledby="add-title">
        <h2 id="add-title">הוספת פריט לספרייה</h2>
        {general && <div className="msg msg-error" role="alert">{general}</div>}
        {success && <div className="msg msg-success" role="status">{success}</div>}
        <Field id="title" label="כותרת" value={form.title} maxLength={200} autoComplete="off"
          placeholder="למשל: הרצאה על מערכות הפעלה" onChange={(e) => setForm({ ...form, title: e.target.value })} error={errors.title} />
        <fieldset className="radio-group">
          <legend>סוג התוכן</legend>
          {TYPES.map((t) => (
            <label key={t.value} className="radio-pill">
              <input type="radio" name="type" value={t.value} checked={form.type === t.value}
                onChange={() => { setForm({ ...form, type: t.value }); setErrors({}); }} />
              {t.label}
            </label>
          ))}
        </fieldset>
        <Field id="source" label={type.sourceLabel} as={form.type === "text" ? "textarea" : "input"}
          type={form.type === "text" ? undefined : "url"} dir={form.type === "text" ? "auto" : "ltr"}
          placeholder={type.placeholder} value={form.source} autoComplete="off"
          hint={form.type === "web" ? "השרת שולף את הטקסט מהדף ומציג אותו בתצוגת קריאה נוחה." : undefined}
          onChange={(e) => setForm({ ...form, source: e.target.value })} error={errors.source} />
        <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
          {busy ? (form.type === "web" ? "שולפת את הדף..." : "מוסיפה...") : "הוספה לספרייה"}
        </button>
      </form>

      <h2 style={{ marginTop: 28 }}>הפריטים שלי {items && `(${items.length})`}</h2>
      {loadError && <div className="msg msg-error" role="alert">{loadError}</div>}
      {!items && !loadError && <Spinner label="טוענת את הספרייה..." />}
      {items && items.length === 0 && (
        <EmptyState title="הספרייה שלך עדיין ריקה">
          <p>הוסיפי סרטון, טקסט או דף כדי להתחיל.</p>
        </EmptyState>
      )}
      {items && items.length > 0 && (
        <ul className="content-grid" style={{ listStyle: "none", padding: 0 }} aria-label="רשימת הפריטים בספרייה">
          {items.map((it) => (
            <li key={it.id} className="card content-card">
              <Link to={`/content/${it.id}`} className="thumb" tabIndex={-1} aria-hidden="true">
                {it.type === "youtube" && it.youtube_id ? (
                  <img src={`https://i.ytimg.com/vi/${it.youtube_id}/hqdefault.jpg`} alt="" loading="lazy" />
                ) : (
                  ICONS[it.type]
                )}
              </Link>
              <div className="body">
                <h3><Link to={`/content/${it.id}`}>{it.title}</Link></h3>
                <div className="row small">
                  <span className="tag">{TYPE_LABELS[it.type]}</span>
                  <span className="muted">נוסף ב-{formatDate(it.created_at)}</span>
                </div>
                <div className="actions">
                  <Link className="btn btn-primary btn-sm" to={`/content/${it.id}`}>פתיחה</Link>
                  <button type="button" className="btn btn-sm" onClick={() => { setDeleteError(null); setToDelete(it); }}>מחיקה</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {toDelete && (
        <ConfirmDialog title="מחיקת פריט" message={`למחוק את '${toDelete.title}'? ההיסטוריה של הסשנים תישמר.`}
          confirmLabel="כן, למחוק" cancelLabel="ביטול" danger busy={deleting} error={deleteError}
          onConfirm={confirmDelete} onCancel={() => setToDelete(null)} />
      )}
    </div>
  );
}
