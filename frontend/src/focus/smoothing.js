// Pure functions for score smoothing, personal calibration and the low-focus intervention.
// Unit-tested in focus.test.js. See DECISIONS D-045.

export const LOW_THRESHOLD = 0.4; // default / minimum: smoothed below this -> "low focus"
export const HYSTERESIS = 0.1; // back to "ok" only 0.10 above the threshold
export const RECOVER_THRESHOLD = LOW_THRESHOLD + HYSTERESIS;
export const ALERT_COOLDOWN_MS = 45_000; // at most one alert every 45s
export const RETURN_OFFSET_S = 5; // jump back 5s before focus started dropping
export const EMA_ALPHA = 0.6; // weight of the newest score (faster reaction than 0.5)

// Personal calibration: the model output is compressed differently for every person and camera
// (e.g. 0.5-0.8), so "low" is measured against the user's own usual level.
export const CALIBRATION_MS = 30_000; // first 30 s of scores
export const CALIBRATION_MIN = 5; // ...and at least 5 scores
export const CALIBRATION_MARGIN = 0.15; // low = below (baseline - 0.15)
export const MAX_THRESHOLD = 0.65; // never demand more than this (a 0.95 baseline would be too strict)

/** Exponential moving average. The first value passes through unchanged. */
export function ema(prev, x, alpha = EMA_ALPHA) {
  if (prev === null || prev === undefined || Number.isNaN(prev)) return x;
  return alpha * x + (1 - alpha) * prev;
}

function median(values) {
  const v = [...values].sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export const initialCalibration = () => ({ startedAt: null, samples: [], baseline: null });

/**
 * Feed one RAW model score. Scores taken while the user was looking away / had eyes closed are
 * skipped (excluded=true), so a distracted start does not lower the baseline.
 * After CALIBRATION_MS (and >= CALIBRATION_MIN scores): baseline = median, then it is frozen.
 */
export function stepCalibration(cal, score, now, excluded = false) {
  if (cal.baseline !== null) return cal;
  const c = { ...cal, startedAt: cal.startedAt ?? now, samples: excluded ? cal.samples : [...cal.samples, score] };
  if (now - c.startedAt >= CALIBRATION_MS && c.samples.length >= CALIBRATION_MIN) c.baseline = median(c.samples);
  return c;
}

/** Seconds of calibration left (for the UI line), 0 when done. */
export const calibrationLeft = (cal, now) =>
  cal.baseline !== null || cal.startedAt === null ? 0 : Math.max(0, Math.ceil((CALIBRATION_MS - (now - cal.startedAt)) / 1000));

/** { low, recover } thresholds for a baseline (null = still calibrating -> defaults 0.40/0.50). */
export function thresholdsFor(baseline) {
  const low =
    baseline === null || baseline === undefined
      ? LOW_THRESHOLD
      : Math.min(MAX_THRESHOLD, Math.max(LOW_THRESHOLD, baseline - CALIBRATION_MARGIN));
  const r = (x) => Math.round(x * 1000) / 1000;
  return { low: r(low), recover: r(low + HYSTERESIS) };
}

/** Is THIS reading low? Sent to the server as `low`, which builds the debt segments. */
export const isLowReading = (smoothed, thresholds, lookingAway = false) => lookingAway || smoothed < thresholds.low;

/**
 * Hysteresis + cooldown state machine.
 * state = { low: boolean, lastAlertAt: number|null }
 * opts.thresholds = { low, recover } (personal, from thresholdsFor); opts.forceLow = a sustained
 * look-away / eyes closed (D-046) enters "low" immediately, whatever the score.
 * Returns { state, fireAlert } where fireAlert is true when a NEW alert should be shown.
 */
export function stepAlert(state, smoothed, now, opts = {}) {
  const th = opts.thresholds ?? { low: LOW_THRESHOLD, recover: RECOVER_THRESHOLD };
  const forceLow = !!opts.forceLow;
  const s = { ...state };
  let fireAlert = false;
  const low = forceLow || (smoothed !== null && smoothed !== undefined && smoothed < th.low);
  if (!s.low && low) {
    s.low = true;
    if (s.lastAlertAt === null || now - s.lastAlertAt >= ALERT_COOLDOWN_MS) {
      fireAlert = true;
      s.lastAlertAt = now;
    }
  } else if (s.low && !forceLow && smoothed > th.recover) {
    s.low = false;
  }
  return { state: s, fireAlert };
}

export const initialAlertState = () => ({ low: false, lastAlertAt: null });

/**
 * Where to send the user back: the position of the last reading whose smoothed score was still
 * >= the recover threshold (0.5 by default, personal after calibration) and was not flagged low,
 * minus 5 seconds (never below 0). Falls back to the first reading.
 * readings: chronological [{position, smoothed, low?}]
 */
export function returnPoint(readings, unit = "seconds", recover = RECOVER_THRESHOLD) {
  if (!readings.length) return 0;
  let candidate = null;
  for (let i = readings.length - 1; i >= 0; i--) {
    if (readings[i].smoothed >= recover && !readings[i].low) {
      candidate = readings[i].position;
      break;
    }
  }
  if (candidate === null) candidate = readings[0].position;
  if (unit === "paragraphs") return Math.max(0, Math.floor(candidate));
  return Math.max(0, candidate - RETURN_OFFSET_S);
}
