// D-050/D-051: 3+ minutes of continuous measurement with the face video:
//   fast start (faces confirmed, provisional score ~3 s, full score ~10 s), a real tab switch and
//   back, and a clean diagnostics snapshot (CPU, no errors, no re-created landmarker).
//   The measurement must never stall and must never show "no face".
import { expect, test } from "@playwright/test";
import { openSessionWithCamera } from "./helpers.js";

test("3 minutes of continuous measurement survives a tab switch, with clean diagnostics", async ({ page, context }) => {
  test.setTimeout(330_000);
  const readings = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && /\/api\/sessions\/[^/]+\/readings$/.test(r.url())) readings.push(Date.now());
  });
  // record every appearance of the "no face" banner
  await page.addInitScript(() => {
    window.__noFaceSeen = 0;
    new MutationObserver(() => {
      if (document.querySelector('[data-testid="no-face"]')) window.__noFaceSeen += 1;
    }).observe(document, { childList: true, subtree: true });
  });

  await openSessionWithCamera(page, "soak", "?debug=1");
  const t0 = Date.now();
  const sec = () => ((Date.now() - t0) / 1000).toFixed(1);
  await expect(page.getByTestId("face-ok")).toBeVisible({ timeout: 15_000 });
  console.log(`faces confirmed after ${sec()}s`);
  await expect(page.locator('[data-testid="score-value"][data-provisional="true"]')).toBeVisible({ timeout: 20_000 });
  console.log(`provisional score after ${sec()}s`);
  await expect(page.locator('[data-testid="score-value"][data-provisional="false"]')).toBeVisible({ timeout: 30_000 });
  console.log(`full score after ${sec()}s`);
  expect(readings.length).toBeGreaterThan(0); // provisional scores are never sent: only full ones
  const firstFullAt = Date.now();

  const expectReadingsResume = async (label) => {
    const before = readings.length;
    await expect.poll(() => readings.length, { timeout: 20_000, message: `${label}: readings resume` }).toBeGreaterThan(before + 1);
    console.log(`${label}: readings resumed at ${sec()}s (total ${readings.length})`);
  };

  // ---- 1) measure ~40 s ----
  await page.waitForTimeout(40_000);
  await expectReadingsResume("steady");

  // ---- 2) real tab switch for 15 s, then back ----
  const other = await context.newPage();
  await other.goto("about:blank");
  await other.bringToFront();
  await page.waitForTimeout(500);
  const hidden = await page.evaluate(() => document.visibilityState);
  console.log(`visibilityState after switching tabs: ${hidden}`);
  if (hidden !== "hidden") {
    // headless Chromium may keep background pages "visible": simulate the browser behaviour
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
  }
  await expect(page.getByText("המדידה מושהית כשהלשונית לא פעילה")).toBeVisible();
  await page.waitForTimeout(15_000);
  await page.bringToFront();
  await other.close();
  if (hidden !== "hidden") {
    await page.evaluate(() => {
      delete document.hidden;
      delete document.visibilityState;
      document.dispatchEvent(new Event("visibilitychange"));
    });
  }
  await expect(page.getByText("המדידה מושהית כשהלשונית לא פעילה")).toHaveCount(0);
  await expectReadingsResume("after tab switch");

  // ---- 3) the diagnostics snapshot (what "העתקת אבחון" copies) is consistent ----
  const diag = await page.evaluate(() => window.__focusDiagnostics());
  console.log("diagnostics:", JSON.stringify({ delegate: diag.delegate, input: diag.input, initMs: diag.landmarkerInitMs,
    timingsMs: diag.timingsMs, framesAnalyzed: diag.framesAnalyzed, facesFound: diag.facesFound, skipped: diag.skipped,
    detectMsAvg: diag.detectMsAvg, copyMsAvg: diag.copyMsAvg, recreations: diag.recreations }));
  expect(diag.delegate).toBe("CPU");
  expect(diag.input).toBe("image");
  expect(diag.recreations).toBe(0);
  expect(diag.lastErrors).toEqual([]);
  expect(diag.lastResults.length).toBe(20);
  expect(diag.facesFound).toBeGreaterThan(0.95 * diag.framesAnalyzed);

  // ---- 4) keep measuring until 3 minutes of measurement have passed ----
  const left = 180_000 - (Date.now() - firstFullAt);
  if (left > 0) await page.waitForTimeout(left);
  await expectReadingsResume("at 3 minutes");

  // readings never stalled for long while the tab was visible (largest gap, tab-switch excluded)
  const gaps = readings.slice(1).map((t, i) => t - readings[i]).sort((a, b) => b - a);
  console.log(`readings: ${readings.length} in ${sec()}s; largest gaps (ms): ${gaps.slice(0, 4).join(", ")}`);
  expect(gaps[1]).toBeLessThan(12_000); // [0] is the tab switch; everything else is the normal 2 s
  expect(await page.evaluate(() => window.__noFaceSeen)).toBe(0);
  await expect(page.getByTestId("detect-error")).toHaveCount(0);

  await page.getByRole("button", { name: /סיום סשן/ }).click();
  await expect(page.getByText("הסשן נשמר ✓")).toBeVisible();
  const saved = Number(await page.locator(".kv dt:has-text('מספר מדידות') + dd").innerText());
  console.log(`server saved ${saved} readings, client sent ${readings.length}`);
  expect(saved).toBe(readings.length);
});
