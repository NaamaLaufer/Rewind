// The ?debug=1 panel: hidden by default, and with the flag it reports faces/confidence/resolution/camera.
// Runs in the "face" project (face video) and, via debugpanel-noface.spec.js, in the "noface" project.
import { expect, test } from "@playwright/test";
import { openSessionWithCamera } from "./helpers.js";

test("debug panel is hidden without ?debug=1", async ({ page }) => {
  await openSessionWithCamera(page, "nodebug");
  await expect(page.getByTestId("score-value")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("debug-panel")).toHaveCount(0);
});

test("debug panel with a face: faces/sec > 0, confidence, resolution, camera label", async ({ page }) => {
  await openSessionWithCamera(page, "debugface", "?debug=1");
  const panel = page.getByTestId("debug-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("פנים מזוהות ✓", { timeout: 20_000 });
  await page.waitForTimeout(1500);
  const text = await panel.innerText();
  console.log("---- panel (face) ----\n" + text);
  expect(text).toMatch(/פנים שזוהו בשנייה\s+([1-9]\d*) מתוך/);
  expect(text).toMatch(/ביטחון זיהוי \(FaceDetector\)\s+הכי גבוה: 0\.[5-9]\d · פנים מעל 0\.5: 1/);
  expect(text).toMatch(/רזולוציית וידאו\s+\d+×\d+/);
  expect(text).toMatch(/delegate \/ input\s+CPU \/ video/);
  await panel.screenshot({ path: "test-results/debug-panel-face.png" });
});
