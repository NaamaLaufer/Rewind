// Screenshot tour of every screen (desktop + 375px mobile) for the manual clarity review.
// Run: TOUR_DIR=<folder> npx playwright test tour --project face
import { expect, test } from "@playwright/test";
import { registerAndLogin, YT_URL } from "./helpers.js";

const DIR = process.env.TOUR_DIR;
test.skip(!DIR, "set TOUR_DIR to run the screenshot tour");

for (const vp of [{ name: "desktop", width: 1366, height: 900 }, { name: "mobile", width: 375, height: 812 }]) {
  test(`tour ${vp.name}`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(vp);
    const shot = (n) => page.screenshot({ path: `${DIR}/${vp.name}-${n}.png`, fullPage: true });
    await page.goto("/register");
    await shot("01-register");
    await registerAndLogin(page, `tour${vp.name}`, "נעמה");
    await shot("02-library-empty");
    await page.getByLabel("כותרת").fill("רשתות נוירונים בקצרה");
    await page.getByLabel("קישור לסרטון YouTube").fill(YT_URL);
    await page.getByRole("button", { name: "הוספה לספרייה" }).click();
    await page.getByLabel("כותרת").fill("מאמר על קשב");
    await page.getByLabel("טקסט להדבקה").check();
    await page.getByLabel("הטקסט").fill(Array.from({ length: 8 }, (_, i) => `פסקה ${i + 1}: קשב הוא היכולת להתמקד בדבר אחד ולהתעלם מהסחות דעת. כשאנחנו לומדים, הקשב עולה ויורד כל הזמן, וזה טבעי לגמרי.`).join("\n\n"));
    await page.getByRole("button", { name: "הוספה לספרייה" }).click();
    await expect(page.getByText("מאמר על קשב").first()).toBeVisible();
    await shot("03-library");
    await page.getByRole("link", { name: "פתיחה" }).last().click();
    await shot("04-content-idle");
    await page.getByRole("button", { name: /התחלת סשן/ }).click();
    await shot("05-consent");
    await page.getByRole("button", { name: /הפעלת מצלמה/ }).click();
    await expect(page.getByTestId("score-value")).toBeVisible({ timeout: 45_000 });
    await page.waitForTimeout(6000);
    await shot("06-measuring");
    await page.getByRole("button", { name: /סיום סשן/ }).click();
    await expect(page.getByText("הסשן נשמר ✓")).toBeVisible();
    await shot("07-summary");
    await page.goto("/history");
    await expect(page.locator("tbody tr").first()).toBeVisible();
    await page.waitForTimeout(800);
    await shot("08-history");
    await page.locator("tbody tr").first().getByRole("link", { name: /פרטים/ }).click();
    await page.waitForTimeout(800);
    await shot("09-session");
    await page.goto("/profile");
    await shot("10-profile");
    await page.goto("/about");
    await shot("11-about");
    await page.goto("/content/000000000000000000000000");
    await shot("12-notfound");
  });
}
