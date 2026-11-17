// Pure functions for score smoothing and the low-focus intervention. Unit-tested in smoothing.test.js.

export const LOW_THRESHOLD = 0.4; // smoothed below this -> "low focus" (alert + debt)
export const RECOVER_THRESHOLD = 0.5; // hysteresis: back to "ok" only above this
export const ALERT_COOLDOWN_MS = 45_000; // at most one alert every 45s
export const RETURN_OFFSET_S = 5; // jump back 5s before focus started dropping

/** Exponential moving average. The first value passes through unchanged. */
export function ema(prev, x, alpha = 0.5) {
  if (prev === null || prev === undefined || Number.isNaN(prev)) return x;
  return alpha * x + (1 - alpha) * prev;
}

/**
 * Hysteresis + cooldown state machine.
 * state = { low: boolean, lastAlertAt: number|null }
 * Returns { state, fireAlert } where fireAlert is true when a NEW alert should be shown.
 */
export function stepAlert(state, smoothed, now) {
  const s = { ...state };
  let fireAlert = false;
  if (!s.low && smoothed < LOW_THRESHOLD) {
    s.low = true;
    if (s.lastAlertAt === null || now - s.lastAlertAt >= ALERT_COOLDOWN_MS) {
      fireAlert = true;
      s.lastAlertAt = now;
    }
  } else if (s.low && smoothed > RECOVER_THRESHOLD) {
    s.low = false;
  }
  return { state: s, fireAlert };
}

export const initialAlertState = () => ({ low: false, lastAlertAt: null });

/**
 * Where to send the user back: the position of the last reading whose smoothed score was
 * still >= 0.5, minus 5 seconds (never below 0). Falls back to the first low reading.
 * readings: chronological [{position, smoothed}]
 */
export function returnPoint(readings, unit = "seconds") {
  if (!readings.length) return 0;
  let candidate = null;
  for (let i = readings.length - 1; i >= 0; i--) {
    if (readings[i].smoothed >= RECOVER_THRESHOLD) {
      candidate = readings[i].position;
      break;
    }
  }
  if (candidate === null) candidate = readings[0].position;
  if (unit === "paragraphs") return Math.max(0, Math.floor(candidate));
  return Math.max(0, candidate - RETURN_OFFSET_S);
}
