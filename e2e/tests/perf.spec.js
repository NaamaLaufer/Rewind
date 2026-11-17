// Measures the real MediaPipe frame rate with each delegate (CPU vs GPU) in this browser.
// Run: PERF=1 npx playwright test perf --project face
import { expect, test } from "@playwright/test";
import { registerAndLogin, YT_URL } from "./helpers.js";

test.skip(!process.env.PERF, "set PERF=1 to run the delegate benchmark");

for (const delegate of ["CPU", "GPU"]) {
  test(`frame rate with ${delegate} delegate`, async ({ page }) => {
    await registerAndLogin(page, `perf${delegate}`, "מדידה");
    await page.getByLabel("כותרת").fill("סרטון");
    await page.getByLabel("קישור לסרטון YouTube").fill(YT_URL);
    await page.getByRole("button", { name: "הוספה לספרייה" }).click();
    await page.getByRole("link", { name: "פתיחה" }).first().click();
    await page.goto(`${page.url()}${delegate === "GPU" ? "?gpu=1" : ""}`);
    await page.getByRole("button", { name: /התחלת סשן/ }).click();
    await page.getByRole("button", { name: /הפעלת מצלמה/ }).click();
    const card = page.locator("section.score-card");
    await expect(card).toBeVisible();
    const t0 = Date.now();
    await page.waitForTimeout(12_000);
    const fps = await card.getAttribute("data-fps");
    const ms = await card.getAttribute("data-detect-ms");
    let firstScoreAt = null;
    try {
      await expect(page.locator('[data-testid="score-value"][data-provisional="false"]')).toBeVisible({ timeout: 40_000 });
      firstScoreAt = ((Date.now() - t0) / 1000 + 0).toFixed(1);
    } catch {
      /* report below */
    }
    console.log(`${delegate}: fps=${fps} detect=${ms}ms first score ~${firstScoreAt ?? ">52"}s after camera on`);
  });
}
