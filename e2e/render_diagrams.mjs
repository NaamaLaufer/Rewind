// Renders every ```mermaid block of docs/diagrams/diagrams.md to a PNG next to it,
// using the Playwright Chromium already installed for the E2E tests (no mermaid-cli/puppeteer).
// Usage: cd e2e && npm install && node render_diagrams.mjs
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const mermaidJs = readFileSync(require.resolve("mermaid/dist/mermaid.min.js"), "utf8");
const mdPath = fileURLToPath(new URL("../docs/diagrams/diagrams.md", import.meta.url));
const outDir = fileURLToPath(new URL("../docs/diagrams/", import.meta.url));
const NAMES = ["use-case", "architecture", "sequence", "erd", "state-machine"];

const blocks = [...readFileSync(mdPath, "utf8").matchAll(/```mermaid\n([\s\S]*?)```/g)].map((m) => m[1]);
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1400, height: 1000 } });
await page.setContent(`<html dir="rtl"><body style="margin:0;background:#fff;font-family:Arial"><div id="out"></div></body></html>`);
await page.addScriptTag({ content: mermaidJs });
await page.evaluate(() => window.mermaid.initialize({ startOnLoad: false, theme: "neutral", fontFamily: "Arial" }));

for (const [i, code] of blocks.entries()) {
  const name = NAMES[i] ?? `diagram-${i + 1}`;
  await page.evaluate(async ({ code, id }) => {
    const { svg } = await window.mermaid.render(id, code);
    const out = document.getElementById("out");
    out.innerHTML = `<div id="wrap" style="display:inline-block;padding:16px;background:#fff">${svg}</div>`;
  }, { code, id: `d${i}` });
  await page.locator("#wrap").screenshot({ path: `${outDir}${name}.png` });
  console.log("rendered", name);
}
await browser.close();
