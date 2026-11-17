// "noface" project: Chrome's synthetic camera has no face -> panel must say so, with confidence 0.
import { expect, test } from "@playwright/test";
import { openSessionWithCamera } from "./helpers.js";

test("debug panel without a face: 0 faces/sec, detector finds nothing, canvas input works", async ({ page }) => {
  await openSessionWithCamera(page, "debugnoface", "?debug=1&input=canvas");
  const panel = page.getByTestId("debug-panel");
  await expect(page.getByTestId("no-face")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  const text = await panel.innerText();
  console.log("---- panel (no face, input=canvas) ----\n" + text);
  expect(text).toMatch(/פנים שזוהו בשנייה\s+0 מתוך [1-9]/);
  expect(text).toMatch(/delegate \/ input\s+CPU \/ canvas/);
  expect(text).toMatch(/שגיאה אחרונה\s+אין/);
  expect(text).toMatch(/פנים מעל 0\.6: 0/);
  expect(text).not.toContain("הגלאי (FaceDetector) רואה פנים");
});
