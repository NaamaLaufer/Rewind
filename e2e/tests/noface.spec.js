// Chrome's default fake camera shows a synthetic pattern without a face.
import { expect, test } from "@playwright/test";
import { registerAndLogin, YT_URL } from "./helpers.js";

test("no face in the camera -> clear message, site keeps working", async ({ page }) => {
  await registerAndLogin(page, "noface", "בלי פנים");
  await page.getByLabel("כותרת").fill("סרטון");
  await page.getByLabel("קישור לסרטון YouTube").fill(YT_URL);
  await page.getByRole("button", { name: "הוספה לספרייה" }).click();
  await page.getByRole("link", { name: "פתיחה" }).first().click();
  await page.getByRole("button", { name: /התחלת סשן/ }).click();
  await page.getByRole("button", { name: /הפעלת מצלמה/ }).click();
  await expect(page.getByTestId("no-face")).toContainText("לא זוהו פנים", { timeout: 30_000 });
  await expect(page.getByTestId("score-value")).toHaveCount(0); // the model does not run
  // the site keeps working: the session can still be ended and saved
  await page.getByRole("button", { name: /סיום סשן/ }).click();
  await expect(page.getByText("הסשן נשמר ✓")).toBeVisible();
});

test("camera skipped -> session continues without measurement", async ({ page }) => {
  await registerAndLogin(page, "skipcam", "בלי מצלמה");
  await page.getByLabel("כותרת").fill("סרטון");
  await page.getByLabel("קישור לסרטון YouTube").fill(YT_URL);
  await page.getByRole("button", { name: "הוספה לספרייה" }).click();
  await page.getByRole("link", { name: "פתיחה" }).first().click();
  await page.getByRole("button", { name: /התחלת סשן/ }).click();
  await page.getByRole("button", { name: "המשך בלי מצלמה" }).click();
  await expect(page.getByText("המדידה כבויה")).toBeVisible();
  await page.getByRole("button", { name: /סיום סשן/ }).click();
  await expect(page.getByText("הסשן נשמר ✓")).toBeVisible();
});
