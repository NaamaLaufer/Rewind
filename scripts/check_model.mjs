// Sanity check: load v4_7 with onnxruntime-node, run on zeros [1,100,478,3], print outputs.
// Usage (from the repo root, after `cd e2e && npm install`):
//   node scripts/check_model.mjs [path/to/model.onnx]
import { createRequire } from "node:module";

// onnxruntime-node lives in e2e/node_modules (kept out of the frontend image on purpose).
const require = createRequire(new URL("../e2e/package.json", import.meta.url));
const ort = require("onnxruntime-node");

const path = process.argv[2] ?? "frontend/public/models/v4_7.onnx";
const session = await ort.InferenceSession.create(path);
console.log("inputs:", session.inputNames, "outputs:", session.outputNames);

const input = new ort.Tensor("float32", new Float32Array(100 * 478 * 3), [1, 100, 478, 3]);
const t0 = performance.now();
const out = await session.run({ [session.inputNames[0]]: input });
console.log(`inference: ${(performance.now() - t0).toFixed(1)} ms`);
for (const name of session.outputNames) {
  const t = out[name];
  console.log(name, t.dims, Array.from(t.data.slice(0, 5)).map((v) => +v.toFixed(4)));
}
const expected = ["regression_scores", "classification_logits", "attention_weights"];
const missing = expected.filter((n) => !session.outputNames.includes(n));
if (missing.length) {
  console.error("MISSING outputs:", missing);
  process.exit(1);
}
console.log("OK: 3 outputs present");
