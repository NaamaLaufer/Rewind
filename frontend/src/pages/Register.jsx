import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { api, fieldErrors } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.jsx";
import Field from "../components/Field.jsx";

export const PASSWORD_RULES = [
  { test: (p) => p.length >= 8, text: "לפחות 8 תווים" },
  { test: (p) => /\p{L}/u.test(p), text: "לפחות אות אחת" },
  { test: (p) => /\d/.test(p), text: "לפחות ספרה אחת" },
];

export function PasswordRules({ value, id }) {
  return (
    <ul className="rules" id={id}>
      {PASSWORD_RULES.map((r) => {
        const ok = r.test(value);
        return <li key={r.text} className={ok ? "ok" : ""}>{ok ? "✓" : "○"} {r.text}</li>;
      })}
    </ul>
  );
}

export default function Register() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: "", password: "", display_name: "" });
  const [errors, setErrors] = useState({});
  const [general, setGeneral] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { document.title = "הרשמה · Rewind"; }, []);

  if (user) return <Navigate to="/library" replace />;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.email.trim()) errs.email = "נא למלא אימייל";
    if (!form.display_name.trim()) errs.display_name = "נא למלא שם תצוגה";
    const failed = PASSWORD_RULES.find((r) => !r.test(form.password));
    if (failed) errs.password = form.password.length < 8 ? "הסיסמה קצרה מדי: צריך לפחות 8 תווים" : `הסיסמה צריכה ${failed.text}`;
    setErrors(errs);
    setGeneral(null);
    if (Object.keys(errs).length) return;

    setBusy(true);
    try {
      await api("/auth/register", { method: "POST", body: form, auth: false });
      navigate("/login", { state: { email: form.email.trim(), success: "נרשמת בהצלחה! עכשיו אפשר להתחבר." } });
    } catch (err) {
      if (err.status === 409) setErrors({ email: "כתובת האימייל הזו כבר רשומה. אפשר להתחבר במקום." });
      else if (err.status === 422) {
        const fe = fieldErrors(err);
        if (Object.keys(fe).length) setErrors(fe);
        else setGeneral(err.message);
      } else setGeneral(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="narrow">
      <div className="page-header">
        <h1>הרשמה ל-Rewind</h1>
        <p className="lead">פותחים חשבון בחינם, ומתחילים ללמוד בלי לפספס אף רגע.</p>
      </div>
      <form className="card" onSubmit={submit} noValidate>
        {location.state?.message && <div className="msg msg-success" role="status">{location.state.message}</div>}
        {general &&<div className="msg msg-error" role="alert">{general}</div>}
        <Field id="email" label="אימייל" type="email" autoComplete="email" inputMode="email" dir="ltr"
          value={form.email} onChange={set("email")} error={errors.email} required>
          {errors.email?.includes("כבר רשומה") && <div className="small"><Link to="/login" state={{ email: form.email }}>להתחברות</Link></div>}
        </Field>
        <Field id="password" label="סיסמה" type="password" autoComplete="new-password" dir="ltr"
          value={form.password} onChange={set("password")} error={errors.password} required>
          <PasswordRules value={form.password} id="password-rules" />
        </Field>
        <Field id="display_name" label="שם תצוגה" autoComplete="nickname" hint="השם שיופיע באתר, למשל: נעמה"
          value={form.display_name} onChange={set("display_name")} error={errors.display_name} required />
        <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
          {busy ? "נרשמת..." : "הרשמה"}
        </button>
        <p style={{ marginTop: 16, marginBottom: 0 }}>כבר יש לך חשבון? <Link to="/login">להתחברות</Link></p>
      </form>
    </div>
  );
}
