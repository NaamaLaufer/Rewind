// fetch wrapper: base URL from config, Bearer token, JSON, readable Hebrew errors, 401 handling.
// The base is RELATIVE ("/api"): nginx (Docker) or Vite (dev) proxies it to the backend,
// whose address is configured by the BACKEND_URL environment variable - never hard-coded here.
const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";
const TOKEN_KEY = "rewind_token";

export const tokenStore = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

let unauthorizedHandler = null;
export const setUnauthorizedHandler = (fn) => {
  unauthorizedHandler = fn;
};

export class ApiError extends Error {
  constructor(status, message, errors = null) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

const DEFAULTS = {
  400: "הבקשה לא תקינה",
  401: "החיבור פג, נא להתחבר שוב",
  404: "לא נמצא",
  409: "התנגשות: הפעולה לא אפשרית במצב הנוכחי",
  422: "חלק מהפרטים לא תקינים",
  429: "יותר מדי ניסיונות. נסי שוב בעוד כמה דקות",
  502: "שירות חיצוני לא הגיב. נסי שוב מאוחר יותר",
  503: "השירות לא זמין כרגע",
};

export async function api(path, { method = "GET", body, auth = true, keepalive = false } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const token = tokenStore.get();
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      keepalive,
    });
  } catch {
    throw new ApiError(0, "אין חיבור לשרת. בדקי את החיבור לאינטרנט ונסי שוב.");
  }

  if (res.status === 401 && auth) {
    tokenStore.clear();
    unauthorizedHandler?.();
    throw new ApiError(401, DEFAULTS[401]);
  }
  if (res.status === 204) return null;

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty or non-JSON body */
  }
  if (!res.ok) {
    const msg = typeof data?.detail === "string" ? data.detail : DEFAULTS[res.status] ?? "משהו השתבש. נסי שוב.";
    throw new ApiError(res.status, msg, data?.errors ?? null);
  }
  return data;
}

/** Map the server's 422 `errors` to { fieldName: message } for showing errors next to fields. */
export function fieldErrors(err) {
  const out = {};
  for (const e of err?.errors ?? []) {
    const field = e.loc?.[e.loc.length - 1];
    if (field && !out[field]) out[field] = e.message;
  }
  return out;
}
