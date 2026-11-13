// Second Pass: build a watch session with low readings through the API, then use the UI.
// (The closing logic itself is covered by pytest: a fake camera can't guarantee a high score.)
import { expect, test } from "@playwright/test";
import { apiToken, login, uniqueEmail, YT_URL } from "./helpers.js";

test("session page shows debt; Second Pass opens on segment 1 and seeks the player", async ({ page, request }) => {
  const email = uniqueEmail("review");
  const token = await apiToken(request, email, "חוזרת");
  const H = { Authorization: `Bearer ${token}` };
  const c = await (await request.post("/api/content", { headers: H, data: { title: "סרטון עם חוב", type: "youtube", source: YT_URL } })).json();
  const s = await (await request.post("/api/sessions", { headers: H, data: { content_id: c.id } })).json();
  // focused 0..38s, unfocused 40..60s, focused again -> one missed segment 30..60
  for (let pos = 0; pos <= 80; pos += 2) {
    const sc = pos >= 40 && pos <= 60 ? 0.2 : 0.85;
    await request.post(`/api/sessions/${s.id}/readings`, { headers: H, data: { position: pos, score: sc, smoothed: sc } });
  }
  const end = await (await request.post(`/api/sessions/${s.id}/end`, { headers: H })).json();
  expect(end.debt_seconds).toBe(30);

  await login(page, email);
  await expect(page).toHaveURL(/\/library/);
  await page.goto(`/sessions/${s.id}`);
  await expect(page.getByRole("heading", { name: "קטעים שהוחמצו" })).toBeVisible();
  await expect(page.getByText("⏪ פתוח: 0:30–1:00")).toBeVisible();
  await page.getByRole("link", { name: /מעבר שני: לצפות רק במה שפספסתי/ }).click();

  await expect(page.getByRole("button", { name: /התחלת מעבר שני/ })).toBeVisible();
  await page.getByRole("button", { name: /התחלת מעבר שני/ }).click();
  await expect(page.getByText("מעבר שני: קטע 1 מתוך 1")).toBeVisible();
  await page.getByRole("button", { name: "המשך בלי מצלמה" }).click();

  // the YouTube player should have jumped to the start of the segment (0:30)
  const t = await page.waitForFunction(() => {
    const f = document.querySelector(".player-wrap iframe");
    return f ? true : false;
  }, null, { timeout: 30_000 });
  expect(t).toBeTruthy();

  // the history page lists the item under "content with open debt"
  await page.getByRole("button", { name: /סיום מעבר שני/ }).click();
  await expect(page.getByText("המעבר השני נשמר ✓")).toBeVisible();
  await page.goto("/history");
  await expect(page.getByRole("heading", { name: "תוכן עם חוב פתוח" })).toBeVisible();
  await expect(page.getByRole("link", { name: /השלמת חוב/ })).toBeVisible();
});
