// D-051: camera startup stress test. 20 cycles of: open the item -> start a session -> camera on ->
// faces detected + a score -> end (or leave the page in the middle) -> open again.
// Navigation is done with in-app clicks only (no page reloads), so module-level state (the
// MediaPipe landmarker, the ONNX session) survives between sessions, exactly like a real user who
// opens session after session. Every cycle must detect the face: 20/20.
import { expect, test } from "@playwright/test";
import { registerAndLogin, YT_URL } from "./helpers.js";

const CYCLES = 20;

// Emulates a slow real webcam (like many Windows laptops): getUserMedia takes 0.8 s, the first
// frame arrives ~1 s later, then 1.5 s of black frames (auto-exposure warm-up), then the picture.
const slowWebcam = () => {
  const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async (constraints) => {
    const real = await orig(constraints);
    await new Promise((r) => setTimeout(r, 800));
    const v = document.createElement("video");
    v.muted = true;
    v.srcObject = real;
    await v.play();
    const cv = document.createElement("canvas");
    cv.width = 640;
    cv.height = 480;
    const g = cv.getContext("2d");
    const t0 = performance.now();
    const id = setInterval(() => {
      const t = performance.now() - t0;
      if (t < 1000) return; // no frame at all yet
      if (t < 2500) {
        g.fillStyle = "#000";
        g.fillRect(0, 0, 640, 480);
      } else g.drawImage(v, 0, 0, 640, 480);
    }, 66);
    const out = cv.captureStream(15);
    const track = out.getVideoTracks()[0];
    const stop = track.stop.bind(track);
    track.stop = () => {
      clearInterval(id);
      real.getTracks().forEach((t) => t.stop());
      stop();
    };
    return out;
  };
};

for (const variant of ["fake camera", "slow webcam emulation"]) test(`20 session cycles in a row (${variant}): the camera always starts and the face is always detected`, async ({ page }) => {
  test.setTimeout(20 * 60_000);
  if (variant !== "fake camera") await page.addInitScript(slowWebcam);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  await registerAndLogin(page, "stress", "סטרס");
  await page.getByLabel("כותרת").fill("סרטון");
  await page.getByLabel("קישור לסרטון YouTube").fill(YT_URL);
  await page.getByRole("button", { name: "הוספה לספרייה" }).click();
  await expect(page.getByRole("link", { name: "פתיחה" }).first()).toBeVisible();

  const results = [];
  for (let i = 1; i <= CYCLES; i++) {
    const t0 = Date.now();
    await page.getByRole("link", { name: "פתיחה" }).first().click();
    await page.getByRole("button", { name: /התחלת סשן/ }).click();
    await page.getByRole("button", { name: /הפעלת מצלמה/ }).click();
    let ok = true;
    try {
      await expect(page.getByTestId("face-ok").or(page.locator('[data-testid="score-value"]'))).toBeVisible({ timeout: 20_000 });
      // the window really fills (not stuck): a provisional (30 frames) or full score appears
      await expect(page.locator("[data-testid=score-value]")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId("no-face")).toHaveCount(0);
    } catch (e) {
      ok = false;
      const diag = await page.evaluate(() => window.__focusDiagnostics?.() ?? null).catch(() => null);
      console.log(`cycle ${i} FAILED`, JSON.stringify(diag));
    }
    const ms = Date.now() - t0;
    results.push(ok);
    console.log(`cycle ${i}: ${ok ? "ok" : "FAIL"} in ${(ms / 1000).toFixed(1)}s`);

    if (i % 3 === 0) {
      // leave in the middle of the session through the menu (unmount mid-measurement)
      await page.getByRole("link", { name: "היסטוריה" }).first().click();
      await expect(page.getByRole("heading", { level: 1, name: "היסטוריה" })).toBeVisible();
      await page.getByRole("link", { name: "הספרייה שלי" }).first().click();
    } else if (i % 3 === 1) {
      await page.getByRole("button", { name: /סיום סשן/ }).click();
      await expect(page.getByText("הסשן נשמר ✓")).toBeVisible();
      await page.getByRole("link", { name: "חזרה לספרייה" }).or(page.getByRole("button", { name: "חזרה לספרייה" })).first().click();
    } else {
      // end, then go to history and back to the library before the next cycle
      await page.getByRole("button", { name: /סיום סשן/ }).click();
      await expect(page.getByText("הסשן נשמר ✓")).toBeVisible();
      await page.getByRole("link", { name: "היסטוריה" }).first().click();
      await expect(page.getByRole("heading", { level: 1, name: "היסטוריה" })).toBeVisible();
      await page.getByRole("link", { name: "הספרייה שלי" }).first().click();
    }
    await expect(page.getByRole("heading", { level: 1, name: "הספרייה שלי" })).toBeVisible();
    // every camera track must be stopped once we are back in the library
    const live = await page.evaluate(() => window.__liveCameraTracks?.() ?? 0);
    expect(live, `cycle ${i}: camera still on after leaving the session`).toBe(0);
  }
  const passed = results.filter(Boolean).length;
  console.log(`stress: ${passed}/${CYCLES} cycles detected the face`);
  if (errors.length) console.log("console errors:", errors.slice(0, 10).join("\n"));
  expect(passed).toBe(CYCLES);
});
