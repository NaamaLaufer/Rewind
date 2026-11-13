import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";

/** Same page for: unknown route, item/session that doesn't exist, and someone else's item. */
export default function NotFound({ message = "הדף שחיפשת לא קיים או שאין לך גישה אליו." }) {
  const { user } = useAuth();
  useEffect(() => { document.title = "לא נמצא · Rewind"; }, []);
  return (
    <div className="card big-center">
      <span className="glyph" aria-hidden="true">📼❓</span>
      <h1>לא נמצא</h1>
      <p>{message}</p>
      <Link className="btn btn-primary" to={user ? "/library" : "/login"}>{user ? "חזרה לספרייה" : "להתחברות"}</Link>
    </div>
  );
}
