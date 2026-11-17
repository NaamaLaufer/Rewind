// The 5 attention levels the model was trained on (score anchors 0.05/0.30/0.50/0.70/0.95).
export const LEVEL_LABELS = ["לא מול המצלמה", "לא מרוכזת", "ריכוז חלש", "מרוכזת", "מרוכזת מאוד"];

// Boundaries are the midpoints between the training anchors.
const BOUNDS = [0.175, 0.4, 0.6, 0.825];

export function levelFromScore(score) {
  if (score === null || score === undefined) return null;
  let i = 0;
  while (i < BOUNDS.length && score >= BOUNDS[i]) i++;
  return i;
}
