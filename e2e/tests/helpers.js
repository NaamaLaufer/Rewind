import { expect } from "@playwright/test";

export const PASSWORD = "Focus2026";
export const YT_URL = "https://www.youtube.com/watch?v=aircAruvnKk";
export const uniqueEmail = (tag) => `${tag}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.com`;

export async function register(page, email, name, password = PASSWORD) {
  await page.goto("/register");
  await page.getByLabel("אימייל").fill(email);
  await page.getByLabel("סיסמה").fill(password);
  await page.getByLabel("שם תצוגה").fill(name);
  await page.getByRole("button", { name: "הרשמה" }).click();
}

export async function login(page, email, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("אימייל").fill(email);
  await page.getByLabel("סיסמה").fill(password);
  await page.getByRole("button", { name: "כניסה" }).click();
}

export async function registerAndLogin(page, tag, name) {
  const email = uniqueEmail(tag);
  await register(page, email, name);
  await expect(page).toHaveURL(/\/login/);
  await login(page, email);
  await expect(page).toHaveURL(/\/library/);
  return email;
}

/** Direct API helper (same origin via nginx) for test setup. */
export async function apiToken(request, email, name) {
  await request.post("/api/auth/register", { data: { email, password: PASSWORD, display_name: name } });
  const r = await request.post("/api/auth/login", { data: { email, password: PASSWORD } });
  return (await r.json()).access_token;
}

/** Register, add a YouTube item, open it (optionally with a query like "?debug=1"), start a session
 *  and turn the camera on. */
export async function openSessionWithCamera(page, tag, query = "") {
  await registerAndLogin(page, tag, "דיבאג");
  await page.getByLabel("כותרת").fill("סרטון");
  await page.getByLabel("קישור לסרטון YouTube").fill(YT_URL);
  await page.getByRole("button", { name: "הוספה לספרייה" }).click();
  await page.getByRole("link", { name: "פתיחה" }).first().click();
  if (query) await page.goto(page.url() + query);
  await page.getByRole("button", { name: /התחלת סשן/ }).click();
  await page.getByRole("button", { name: /הפעלת מצלמה/ }).click();
}
