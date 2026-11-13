// The 5 attention levels the model was trained on (score anchors 0.05/0.30/0.50/0.70/0.95).
export const LEVEL_LABELS = ["לא מול המצלמה", "לא מרוכזת", "ריכוז חלש", "מרוכזת", "מרוכזת מאוד"];

// Boundaries: 0.4 is the alert threshold and 0.7 the "focused" line used by the colors
// (mint >= 0.7, amber 0.4-0.7, coral < 0.4), so the word and the color never disagree.
// The outer ones are midpoints between training anchors (0.05|0.30 and 0.70|0.95, rounded).
const BOUNDS = [0.175, 0.4, 0.7, 0.85];

export function levelFromScore(score) {
  if (score === null || score === undefined) return null;
  const s = Math.round(score * 100) / 100; // decide on the value the user actually sees
  let i = 0;
  while (i < BOUNDS.length && s >= BOUNDS[i]) i++;
  return i;
}
