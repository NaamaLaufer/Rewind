// Real model, real low score: the fake camera plays a clip that v4_7 scores ~0.24.
// Checks the whole intervention loop: alert -> "return to" -> debt grows -> summary offers Second Pass.
import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { registerAndLogin, YT_URL } from "./helpers.js";

test.skip(!existsSync(fileURLToPath(new URL("../fixtures/low.y4m", import.meta.url))), "e2e/fixtures/low.y4m missing");

test("low focus -> alert, debt grows, summary offers a Second Pass", async ({ page }) => {
  await registerAndLogin(page, "lowfocus", "מוסחת");
  await page.getByLabel("כותרת").fill("סרטון לבדיקת התראה");
  await page.getByLabel("קישור לסרטון YouTube").fill(YT_URL);
  await page.getByRole("button", { name: "הוספה לספרייה" }).click();
  await page.getByRole("link", { name: "פתיחה" }).first().click();
  await page.getByRole("button", { name: /התחלת סשן/ }).click();
  await page.getByRole("button", { name: /הפעלת מצלמה/ }).click();

  const score = page.locator('[data-testid="score-value"][data-provisional="false"]');
  await expect(score).toBeVisible({ timeout: 45_000 });
  expect(Number(await score.textContent())).toBeLessThan(0.4);

  const alert = page.getByRole("alert").filter({ hasText: "הקשב שלך ירד" });
  await expect(alert).toBeVisible();
  await expect(alert.getByRole("button", { name: /חזרה ל-/ })).toBeVisible();
  await expect(alert.getByRole("button", { name: "הפסקה של 2 דקות" })).toBeVisible();
  await alert.getByRole("button", { name: /חזרה ל-/ }).click();
  await expect(alert).toHaveCount(0);

  // the attention-debt meter is above zero
  await page.waitForTimeout(4000);
  await expect(page.getByTestId("debt-value")).not.toHaveText("0:00 דק׳");

  await page.getByRole("button", { name: /סיום סשן/ }).click();
  await expect(page.getByText("הסשן נשמר ✓")).toBeVisible();
  await expect(page.getByRole("heading", { name: "קטעים שהוחמצו" })).toBeVisible();
  await expect(page.getByRole("button", { name: /מעבר שני: לצפות רק במה שפספסתי/ })).toBeVisible();

  // Start the Second Pass right from the summary
  await page.getByRole("button", { name: /מעבר שני: לצפות רק במה שפספסתי/ }).click();
  await expect(page.getByText(/מעבר שני: קטע 1 מתוך \d+/).first()).toBeVisible();
});
