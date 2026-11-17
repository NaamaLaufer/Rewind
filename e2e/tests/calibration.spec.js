// D-045/D-046: a focused person (face.y4m, looking at the camera) must keep a high score, finish the
// 30 s personal calibration, show "כיול אישי: הרמה הרגילה שלך X", and get NO low-focus alert.
import { expect, test } from "@playwright/test";
import { openSessionWithCamera } from "./helpers.js";

test("focused face: calibration line, high score, no alert, no look-away", async ({ page }) => {
  test.setTimeout(150_000);
  await openSessionWithCamera(page, "calib", "?debug=1");
  await expect(page.getByTestId("score-value")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("calibration")).toContainText("כיול אישי");
  // 30 s of scores after the first one -> baseline
  await expect(page.getByTestId("calibration")).toContainText(/הרמה הרגילה שלך\s*[01]\.\d\d/, { timeout: 60_000 });
  const line = await page.getByTestId("calibration").innerText();
  console.log("calibration:", line);
  const baseline = Number(line.match(/הרמה הרגילה שלך\s*([01]\.\d\d)/)[1]);
  expect(baseline).toBeGreaterThan(0.5);
  // keep measuring a little after calibration with the personal threshold
  await page.waitForTimeout(10_000);
  const panel = await page.getByTestId("debug-panel").innerText();
  console.log("---- panel (focused, after calibration) ----\n" + panel);
  expect(panel).toMatch(/מעל 4 שנ'=false/);
  expect(panel).toMatch(/תנוחת ראש yaw \/ pitch\s+-?\d+° \/ -?\d+° \(רגיל:/);
  await expect(page.locator(".alert-banner")).toHaveCount(0);
  const score = Number(await page.getByTestId("score-value").innerText());
  expect(score).toBeGreaterThan(0.5);
  await expect(page.getByTestId("debt-value")).toHaveText("0:00 דק׳");
});
