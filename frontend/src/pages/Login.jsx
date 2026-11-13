import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import Field from "../components/Field.jsx";

export default function Login() {
  const { user, login } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState(location.state?.email ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { document.title = "התחברות · Rewind"; }, []);

  if (user && !busy) return <Navigate to={location.state?.from ?? "/library"} replace />;

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!email.trim()) errs.email = "נא למלא אימייל";
    if (!password) errs.password = "נא למלא סיסמה";
    setErrors(errs);
    setError(null);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await login(email.trim(), password);
      navigate(location.state?.from ?? "/library", { replace: true });
    } catch (err) {
      setError(err.status === 401 ? "האימייל או הסיסמה שגויים" : err.status === 422 ? "כתובת האימייל לא תקינה" : err.message);
      setBusy(false);
    }
  };

  const info = location.state?.success || location.state?.message;
  return (
    <div className="narrow">
      <div className="page-header">
        <h1>התחברות</h1>
        <p className="lead">ברוכה הבאה ל-Rewind. התחברי כדי להגיע לספרייה שלך.</p>
      </div>
      <form className="card" onSubmit={submit} noValidate>
        {info && !error && (
          <div className={`msg ${location.state?.success ? "msg-success" : "msg-info"}`} role="status">{info}</div>
        )}
        {error && <div className="msg msg-error" role="alert">{error}</div>}
        <Field id="email" label="אימייל" type="email" autoComplete="email" inputMode="email" dir="ltr"
          value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} required />
        <Field id="password" label="סיסמה" type="password" autoComplete="current-password" dir="ltr"
          value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} required />
        <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
          {busy ? "נכנסת..." : "כניסה"}
        </button>
        <p style={{ marginTop: 16, marginBottom: 0 }}>אין לך חשבון? <Link to="/register">להרשמה</Link></p>
      </form>
    </div>
  );
}
