import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, fieldErrors } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import Field from "../components/Field.jsx";
import { formatDate } from "../utils/format.js";
import { PASSWORD_RULES, PasswordRules } from "./Register.jsx";

export default function Profile() {
  const { user, setUser, forget } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(user.display_name);
  const [nameState, setNameState] = useState({ busy: false, error: null, ok: null });
  const [pw, setPw] = useState({ current_password: "", new_password: "" });
  const [pwState, setPwState] = useState({ busy: false, errors: {}, general: null });
  const [dialog, setDialog] = useState(false);
  const [del, setDel] = useState({ busy: false, error: null });

  useEffect(() => { document.title = "הפרופיל שלי · Rewind"; }, []);

  const saveName = async (e) => {
    e.preventDefault();
    if (!name.trim()) return setNameState({ busy: false, error: "נא למלא שם תצוגה", ok: null });
    setNameState({ busy: true, error: null, ok: null });
    try {
      const u = await api("/users/me", { method: "PATCH", body: { display_name: name } });
      setUser(u);
      setName(u.display_name);
      setNameState({ busy: false, error: null, ok: "השם נשמר ✓" });
    } catch (err) {
      setNameState({ busy: false, error: err.message, ok: null });
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    const errors = {};
    if (!pw.current_password) errors.current_password = "נא למלא את הסיסמה הנוכחית";
    if (PASSWORD_RULES.some((r) => !r.test(pw.new_password))) errors.new_password = "הסיסמה החדשה לא עומדת בכללים";
    if (Object.keys(errors).length) return setPwState({ busy: false, errors, general: null });
    setPwState({ busy: true, errors: {}, general: null });
    try {
      await api("/users/me/password", { method: "POST", body: pw });
      forget();
      navigate("/login", { replace: true, state: { email: user.email, success: "הסיסמה הוחלפה. מטעמי אבטחה צריך להתחבר מחדש." } });
    } catch (err) {
      if (err.status === 400) setPwState({ busy: false, errors: { current_password: "הסיסמה הנוכחית שגויה" }, general: null });
      else setPwState({ busy: false, errors: fieldErrors(err), general: err.message });
    }
  };

  const deleteAccount = async () => {
    setDel({ busy: true, error: null });
    try {
      await api("/users/me", { method: "DELETE" });
      forget();
      navigate("/register", { replace: true, state: { message: "החשבון וכל הנתונים שלך נמחקו. אפשר להירשם מחדש בכל עת." } });
    } catch (err) {
      setDel({ busy: false, error: err.message });
    }
  };

  return (
    <div style={{ maxWidth: 720 }}>
      <div className="page-header">
        <h1>הפרופיל שלי</h1>
        <p className="lead">הפרטים שלך, שינוי שם, החלפת סיסמה ומחיקת החשבון.</p>
      </div>

      <section className="card" aria-labelledby="details-title">
        <h2 id="details-title">הפרטים שלי</h2>
        <dl className="kv">
          <dt>אימייל</dt><dd dir="ltr" style={{ textAlign: "right" }}>{user.email}</dd>
          <dt>שם תצוגה</dt><dd>{user.display_name}</dd>
          <dt>הצטרפת ב-</dt><dd>{formatDate(user.created_at)}</dd>
        </dl>
      </section>

      <form className="card" onSubmit={saveName} noValidate aria-labelledby="name-title">
        <h2 id="name-title">שינוי שם תצוגה</h2>
        {nameState.ok && <div className="msg msg-success" role="status">{nameState.ok}</div>}
        <Field id="display_name" label="שם תצוגה חדש" autoComplete="nickname" value={name} maxLength={80}
          onChange={(e) => setName(e.target.value)} error={nameState.error} />
        <button type="submit" className="btn btn-primary" disabled={nameState.busy}>{nameState.busy ? "שומרת..." : "שמירה"}</button>
      </form>

      <form className="card" onSubmit={changePassword} noValidate aria-labelledby="pw-title">
        <h2 id="pw-title">החלפת סיסמה</h2>
        <p className="small muted">אחרי ההחלפה כל החיבורים הקיימים מתבטלים, וצריך להתחבר מחדש.</p>
        {pwState.general && <div className="msg msg-error" role="alert">{pwState.general}</div>}
        <Field id="current_password" label="סיסמה נוכחית" type="password" autoComplete="current-password" dir="ltr"
          value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} error={pwState.errors.current_password} />
        <Field id="new_password" label="סיסמה חדשה" type="password" autoComplete="new-password" dir="ltr"
          value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} error={pwState.errors.new_password}>
          <PasswordRules value={pw.new_password} id="new-password-rules" />
        </Field>
        <button type="submit" className="btn btn-primary" disabled={pwState.busy}>{pwState.busy ? "מחליפה..." : "החלפת סיסמה"}</button>
      </form>

      <section className="card danger-zone" aria-labelledby="danger-title">
        <h2 id="danger-title" style={{ color: "var(--coral-ink)" }}>אזור מסוכן</h2>
        <p>מחיקת החשבון מוחקת לצמיתות את כל הנתונים שלך: הספרייה, הסשנים וכל המדידות. אי אפשר לבטל את זה.</p>
        <button type="button" className="btn btn-danger" onClick={() => setDialog(true)}>מחיקת החשבון</button>
      </section>

      {dialog && (
        <ConfirmDialog title="מחיקת החשבון לצמיתות" danger requireText="מחיקה"
          message="כל הנתונים שלך יימחקו: פריטי תוכן, סשנים ומדידות. אי אפשר לשחזר אותם."
          confirmLabel="מחיקת החשבון לצמיתות" cancelLabel="ביטול" busy={del.busy} error={del.error}
          onConfirm={deleteAccount} onCancel={() => setDialog(false)} />
      )}
    </div>
  );
}
