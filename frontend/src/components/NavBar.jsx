import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";

export default function NavBar() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <header className="navbar">
      <nav className="navbar-inner" aria-label="ניווט ראשי">
        <Link to={user ? "/library" : "/login"} className="brand" aria-label="Rewind, לא מפספסים אף רגע. לדף הבית">
          <span className="brand-name">Rewind <span aria-hidden="true">⏪</span></span>
          <span className="brand-sub">לא מפספסים אף רגע</span>
        </Link>
        <button type="button" className="btn btn-sm menu-toggle" aria-expanded={open} aria-controls="nav-links"
          onClick={() => setOpen((o) => !o)}>
          תפריט
        </button>
        <div id="nav-links" className={`nav-links ${open ? "open" : ""}`}>
          {user ? (
            <>
              <NavLink to="/library">הספרייה שלי</NavLink>
              <NavLink to="/history">היסטוריה</NavLink>
              <NavLink to="/profile">הפרופיל שלי</NavLink>
              <NavLink to="/about">איך זה עובד?</NavLink>
              <span className="nav-hello" data-testid="hello">שלום, {user.display_name}</span>
              <button type="button" className="btn btn-sm" onClick={logout}>התנתקות</button>
            </>
          ) : (
            <>
              <NavLink to="/about">איך זה עובד?</NavLink>
              <NavLink to="/login">התחברות</NavLink>
              <NavLink to="/register">הרשמה</NavLink>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
