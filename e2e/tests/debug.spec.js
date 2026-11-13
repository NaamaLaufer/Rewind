// Diagnostic: load the focus engine in the browser and print console errors. Not part of the suite.
import { test } from "@playwright/test";

test.skip(!process.env.DEBUG_ENGINE, "diagnostic only");

test("engine console", async ({ page }) => {
  const logs = [];
  page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
  page.on("requestfailed", (r) => logs.push(`[reqfail] ${r.url()} ${r.failure()?.errorText}`));
  await page.goto("/login");
  await page.evaluate(async () => {
    const ort = await import("/ort/ort-wasm-simd-threaded.mjs").catch((e) => console.error("ort mjs import", e.message));
    return !!ort;
  });
  await page.waitForTimeout(500);
  console.log(logs.join("\n"));
});
