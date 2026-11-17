// The ?debug=1 panel: hidden by default, and with the flag it reports faces/confidence/resolution/camera.
// Runs in the "face" project (face video) and, via debugpanel-noface.spec.js, in the "noface" project.
import { expect, test } from "@playwright/test";
import { openSessionWithCamera } from "./helpers.js";

test("debug panel is hidden without ?debug=1", async ({ page }) => {
  await openSessionWithCamera(page, "nodebug");
  await expect(page.locator('[data-testid="score-value"][data-provisional="false"]')).toBeVisible({ timeout: 60_000 });
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
  expect(text).toMatch(/ביטחון זיהוי \(FaceDetector\)\s+הכי גבוה: 0\.[89]\d · פנים מעל 0\.75: 1/);
  expect(text).toMatch(/רזולוציית וידאו\s+\d+×\d+/);
  expect(text).toMatch(/delegate \/ input\s+CPU \/ image/);
  expect(text).toMatch(/אתחול FaceLandmarker\s+\d+ms/);
  expect(text).toMatch(/זמן לפריים: העתקה \/ זיהוי\s+[\d.]+ms \/ \d+ms/);
  await panel.screenshot({ path: "test-results/debug-panel-face.png" });
});

test("'העתקת אבחון' copies a JSON snapshot of the camera and the engine", async ({ page, context }) => {
  await context.grantPermissions(["camera", "clipboard-read", "clipboard-write"]);
  await openSessionWithCamera(page, "debugcopy", "?debug=1");
  await expect(page.getByTestId("face-ok")).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(2500); // > 20 analyzed frames
  await page.getByRole("button", { name: /העתקת אבחון/ }).click();
  await expect(page.getByText("האבחון הועתק")).toBeVisible();
  const d = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
  console.log("copied diagnostics:", JSON.stringify(d).slice(0, 600));
  expect(d.userAgent).toContain("Chrome");
  expect(d.camera.label).toBeTruthy();
  expect(d.camera.width).toBeGreaterThan(0);
  expect(d.camera.frameRate).toBeGreaterThan(0);
  expect(d.delegate).toBe("CPU");
  expect(d.landmarkerInitMs).toBeGreaterThan(0);
  expect(d.video).toMatchObject({ paused: false, streamAttached: true });
  expect(d.video.readyState).toBeGreaterThanOrEqual(2);
  expect(d.video.videoWidth).toBeGreaterThan(0);
  expect(d.framesAnalyzed).toBeGreaterThan(20);
  expect(d.facesFound).toBeGreaterThan(0);
  expect(d.lastResults).toHaveLength(20);
  expect(d.lastResults[0]).toEqual(expect.objectContaining({ atMs: expect.any(Number), face: expect.any(Boolean) }));
  expect(d.recreations).toBe(0);
  expect(Array.isArray(d.lastErrors)).toBe(true);
});
