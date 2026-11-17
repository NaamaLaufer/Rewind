import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setUnauthorizedHandler, tokenStore } from "../api/client.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Any 401 from the server: forget the token and go to the login page with a message.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      navigate("/login", { replace: true, state: { message: "החיבור פג, נא להתחבר שוב" } });
    });
    return () => setUnauthorizedHandler(null);
  }, [navigate]);

  // On page load (or refresh): validate the stored token with GET /users/me.
  useEffect(() => {
    if (!tokenStore.get()) {
      setLoading(false);
      return;
    }
    api("/users/me")
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const t = await api("/auth/login", { method: "POST", body: { email, password }, auth: false });
    tokenStore.set(t.access_token);
    const me = await api("/users/me");
    setUser(me);
    return me;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      /* the token may already be invalid - log out locally anyway */
    }
    tokenStore.clear();
    setUser(null);
    navigate("/login", { replace: true, state: { message: "התנתקת בהצלחה." } });
  }, [navigate]);

  /** Local logout without calling the server (after password change / account deletion). */
  const forget = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, setUser, loading, login, logout, forget }), [user, loading, login, logout, forget]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
