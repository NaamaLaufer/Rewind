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

test("no face for more than 5 s -> counted as attention debt, without an extra alert popup", async ({ page }) => {
  await registerAndLogin(page, "nofacedebt", "חוב בלי פנים");
  await page.getByLabel("כותרת").fill("טקסט");
  await page.getByLabel("טקסט להדבקה").check();
  await page.getByLabel("הטקסט").fill("פסקה ראשונה על קשב.\n\nפסקה שנייה על ריכוז.\n\nפסקה שלישית.");
  await page.getByRole("button", { name: "הוספה לספרייה" }).click();
  await page.getByRole("link", { name: "פתיחה" }).first().click();
  await page.getByRole("button", { name: /התחלת סשן/ }).click();
  await expect(page.getByTestId("debt-value")).toHaveText("0 פסקאות");
  await page.getByRole("button", { name: /הפעלת מצלמה/ }).click();
  await expect(page.getByTestId("no-face")).toBeVisible({ timeout: 30_000 });
  // after 5 continuous seconds without a face, the paragraph being read becomes debt
  await expect(page.getByTestId("debt-value")).toHaveText("פסקה אחת", { timeout: 15_000 });
  await expect(page.locator(".alert-banner")).toHaveCount(0); // only the yellow message, no popup
  await page.getByRole("button", { name: /סיום סשן/ }).click();
  await expect(page.getByText("הסשן נשמר ✓")).toBeVisible();
  // the server computed the same debt from the no-face gap
  await expect(page.getByRole("status").getByText("פסקה אחת").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /מעבר שני: לצפות רק במה שפספסתי/ })).toBeVisible();
});
