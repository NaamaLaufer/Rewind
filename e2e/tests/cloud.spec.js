// Assignment 4 checks that work against any BASE_URL (localhost:3000 or https://<domain>):
//  - 20 GET /api/users/me in a row with the SAME token all succeed: every backend instance behind
//    the load balancer shares the same JWT_SECRET and the same database (stateless backend);
//  - data persists: content + a finished session survive a page reload, a logout and a new login.
import { expect, test } from "@playwright/test";
import { apiToken, login, uniqueEmail, YT_URL } from "./helpers.js";

test("20 requests in a row with the same token: all 200 (instances share JWT_SECRET + DB)", async ({ request }) => {
  const token = await apiToken(request, uniqueEmail("stateless"), "מופעים");
  const H = { Authorization: `Bearer ${token}` };
  const codes = [];
  for (let i = 0; i < 20; i++) codes.push((await request.get("/api/users/me", { headers: H })).status());
  console.log("GET /api/users/me x20:", codes.join(","));
  expect(codes).toEqual(Array(20).fill(200));
});

test("data persists after reload, logout and login again", async ({ page, request }) => {
  const email = uniqueEmail("persist");
  const token = await apiToken(request, email, "שומרת");
  const H = { Authorization: `Bearer ${token}` };
  const title = `נשמר בענן ${Date.now()}`;
  const c = await (await request.post("/api/content", { headers: H, data: { title, type: "youtube", source: YT_URL } })).json();
  const s = await (await request.post("/api/sessions", { headers: H, data: { content_id: c.id } })).json();
  for (let pos = 0; pos <= 20; pos += 2) {
    await request.post(`/api/sessions/${s.id}/readings`, { headers: H, data: { position: pos, score: 0.8, smoothed: 0.8 } });
  }
  expect((await request.post(`/api/sessions/${s.id}/end`, { headers: H })).status()).toBe(200);

  await login(page, email);
  await expect(page).toHaveURL(/\/library/);
  await expect(page.getByText(title)).toBeVisible();

  await page.reload(); // still logged in after a refresh
  await expect(page.getByRole("heading", { level: 1, name: "הספרייה שלי" })).toBeVisible();
  await expect(page.getByText(title)).toBeVisible();

  await page.getByRole("button", { name: "התנתקות" }).first().click();
  await expect(page).toHaveURL(/\/login/);
  await login(page, email);
  await expect(page.getByText(title)).toBeVisible();
  await page.getByRole("link", { name: "היסטוריה" }).first().click();
  await expect(page.getByRole("cell", { name: title }).or(page.getByText(title)).first()).toBeVisible();
  await expect(page.getByText("0.80").first()).toBeVisible(); // the session average
});
