// Pure helpers for interpreting the model outputs.

export function softmax(values) {
  const arr = Array.from(values);
  const max = Math.max(...arr);
  const exps = arr.map((v) => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

export function argmax(values) {
  let best = 0;
  for (let i = 1; i < values.length; i++) if (values[i] > values[best]) best = i;
  return best;
}

export const clamp01 = (x) => Math.min(1, Math.max(0, x));

/**
 * Copy a ring buffer of frames into one chronological Float32Array.
 * ring: Float32Array(capacity * frameSize); next: index the NEXT frame will be written to.
 */
export function unrollRing(ring, next, capacity, frameSize) {
  const out = new Float32Array(capacity * frameSize);
  const head = next * frameSize; // oldest frame starts here once the ring is full
  out.set(ring.subarray(head), 0);
  out.set(ring.subarray(0, head), ring.length - head);
  return out;
}
