// Mirrors the assignment's 100-point grading table, step by step, through the browser only.
import { expect, test } from "@playwright/test";
import { login, PASSWORD, register, registerAndLogin, uniqueEmail, YT_URL } from "./helpers.js";

test("full flow: register, login, content, session with camera, history, isolation, logout", async ({ page, browser }) => {
  const email = uniqueEmail("alice");
  page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && console.log(`[browser ${m.type()}] ${m.text()}`));
  page.on("pageerror", (e) => console.log(`[pageerror] ${e.message}`));

  // ---- 2. register: short password + success + duplicate email ----
  await page.goto("/register");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("הרשמה");
  await page.getByLabel("אימייל").fill(email);
  await page.getByLabel("סיסמה").fill("abc");
  await page.getByLabel("שם תצוגה").fill("אליס");
  await page.getByRole("button", { name: "הרשמה" }).click();
  await expect(page.getByText("הסיסמה קצרה מדי")).toBeVisible();

  await page.getByLabel("סיסמה").fill(PASSWORD);
  await page.getByRole("button", { name: "הרשמה" }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText("נרשמת בהצלחה")).toBeVisible();
  await expect(page.getByLabel("אימייל")).toHaveValue(email);

  await register(page, email.toUpperCase(), "שוב");
  await expect(page.getByText("כתובת האימייל הזו כבר רשומה")).toBeVisible();

  // ---- 3. login: wrong password, then correct; display name shown ----
  await login(page, email, "WrongPass1");
  await expect(page.getByText("האימייל או הסיסמה שגויים")).toBeVisible();
  await login(page, email);
  await expect(page).toHaveURL(/\/library/);
  await expect(page.getByTestId("hello")).toHaveText("שלום, אליס");

  // refresh keeps the user logged in
  await page.reload();
  await expect(page.getByTestId("hello")).toHaveText("שלום, אליס");

  // ---- 4. content: empty library, add YouTube item, it appears and opens ----
  await expect(page.getByText("הספרייה שלך עדיין ריקה")).toBeVisible();
  await page.getByLabel("כותרת").fill("רשתות נוירונים בקצרה");
  await page.getByLabel("קישור לסרטון YouTube").fill(YT_URL);
  await page.getByRole("button", { name: "הוספה לספרייה" }).click();
  await expect(page.getByRole("heading", { name: "רשתות נוירונים בקצרה" })).toBeVisible();
  await page.getByRole("link", { name: "פתיחה" }).first().click();
  await expect(page).toHaveURL(/\/content\/[a-f0-9]{24}/);
  const contentUrl = page.url();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("רשתות נוירונים בקצרה");

  // ---- 5. session + camera + score between 0 and 1 ----
  await page.getByRole("button", { name: /התחלת סשן/ }).click();
  await expect(page.getByText("הווידאו לא יוצא מהמחשב שלך")).toBeVisible();
  await page.getByRole("button", { name: /הפעלת מצלמה/ }).click();
  await expect(page.getByText("רק את רואה את זה")).toBeVisible();
  // fast start (D-050): faces confirmed right away, then a provisional score from 30 frames
  const t0 = Date.now();
  await expect(page.getByTestId("face-ok")).toBeVisible({ timeout: 15_000 });
  const provisional = page.locator('[data-testid="score-value"][data-provisional="true"]');
  await expect(provisional).toBeVisible({ timeout: 20_000 });
  console.log(`provisional score ${await provisional.textContent()} after ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await expect(page.getByTestId("score-label")).toHaveText("ציון ראשוני, מתעדכן");
  // ...then the real score from the full 100-frame window
  const score = page.locator('[data-testid="score-value"][data-provisional="false"]');
  await expect(score).toBeVisible({ timeout: 45_000 });
  console.log(`full score after ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await expect(page.getByTestId("score-label")).not.toHaveText("ציון ראשוני, מתעדכן");
  const first = Number(await score.textContent());
  expect(first).toBeGreaterThanOrEqual(0);
  expect(first).toBeLessThanOrEqual(1);
  // let a few more readings arrive (the score keeps updating every 2s)
  await page.waitForTimeout(8_000);
  const later = Number(await score.textContent());
  console.log(`face video scores: first=${first} later=${later}`);
  await expect(page.getByTestId("debt-value")).toBeVisible();

  await page.getByRole("button", { name: /סיום סשן/ }).click();
  await expect(page.getByText("הסשן נשמר ✓")).toBeVisible();
  const avg = Number(await page.getByTestId("summary-average").textContent());
  expect(avg).toBeGreaterThanOrEqual(0);
  expect(avg).toBeLessThanOrEqual(1);

  // ---- history shows the session with an average; details show readings ----
  await page.getByRole("link", { name: "היסטוריה", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("היסטוריה");
  const row = page.locator("tbody tr").first();
  await expect(row).toContainText("רשתות נוירונים בקצרה");
  await expect(row).toContainText(avg.toFixed(2));
  await row.getByRole("link", { name: /פרטים/ }).click();
  await expect(page.getByRole("heading", { name: "טבלת מדידות" })).toBeVisible();
  await expect(page.locator("table tbody tr").first()).toBeVisible();

  // ---- 8. logout returns to login ----
  await page.getByRole("button", { name: "התנתקות" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/library");
  await expect(page).toHaveURL(/\/login/);

  // ---- 7. second user: empty library, first user's item is "not found" ----
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await registerAndLogin(p2, "bob", "בוב");
  await expect(p2.getByText("הספרייה שלך עדיין ריקה")).toBeVisible();
  await p2.goto(contentUrl);
  await expect(p2.getByRole("heading", { name: "לא נמצא" })).toBeVisible();
  await expect(p2.getByText("רשתות נוירונים בקצרה")).toHaveCount(0);
  await p2.goto("/sessions/000000000000000000000000");
  await expect(p2.getByRole("heading", { name: "לא נמצא" })).toBeVisible();
  await ctx.close();
});

test("other content types: pasted text shows a reader view", async ({ page }) => {
  await registerAndLogin(page, "texter", "קוראת");
  await page.getByLabel("כותרת").fill("סיכום קצר");
  await page.getByLabel("טקסט להדבקה").check();
  await page.getByLabel("הטקסט").fill("פסקה ראשונה על קשב.\n\nפסקה שנייה על ריכוז.\n\nפסקה שלישית.");
  await page.getByRole("button", { name: "הוספה לספרייה" }).click();
  await page.getByRole("link", { name: "פתיחה" }).first().click();
  await expect(page.locator("p[data-idx]")).toHaveCount(3);
  await expect(page.getByText("פסקה שנייה על ריכוז.")).toBeVisible();
});

test("delete asks for confirmation", async ({ page }) => {
  await registerAndLogin(page, "deleter", "מוחקת");
  await page.getByLabel("כותרת").fill("למחיקה");
  await page.getByLabel("קישור לסרטון YouTube").fill(YT_URL);
  await page.getByRole("button", { name: "הוספה לספרייה" }).click();
  await page.getByRole("button", { name: "מחיקה" }).click();
  await expect(page.getByRole("dialog")).toContainText("למחוק את 'למחיקה'?");
  await page.getByRole("button", { name: "כן, למחוק" }).click();
  await expect(page.getByText("הספרייה שלך עדיין ריקה")).toBeVisible();
});

test("bad YouTube link shows an error next to the field", async ({ page }) => {
  await registerAndLogin(page, "badlink", "שגיאה");
  await page.getByLabel("כותרת").fill("x");
  await page.getByLabel("קישור לסרטון YouTube").fill("https://example.com/video");
  await page.getByRole("button", { name: "הוספה לספרייה" }).click();
  await expect(page.getByText("זה לא נראה כמו קישור לסרטון YouTube")).toBeVisible();
});
