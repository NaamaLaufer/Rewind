// Head-pose / eyes-closed heuristic from the 478 MediaPipe landmarks we already compute.
// No extra model. Pure functions, unit-tested in focus.test.js. See DECISIONS D-046.
//
// Coordinates: MediaPipe gives x normalized by the frame WIDTH, y by the frame HEIGHT, and z in
// roughly the same scale as x. We convert everything to "width units" (y / aspect) so that
// angles and distances are not distorted by a 4:3 or 16:9 frame.

// Landmark indices (MediaPipe Face Mesh topology)
export const LM = {
  noseTip: 1,
  faceLeft: 234, // image-left cheek edge
  faceRight: 454, // image-right cheek edge
  forehead: 10,
  chin: 152,
  // eye corners + two lid pairs per eye (for the eye aspect ratio)
  rightEye: { outer: 33, inner: 133, top: [160, 158], bottom: [144, 153] },
  leftEye: { outer: 263, inner: 362, top: [385, 387], bottom: [380, 373] },
};

export const YAW_LIMIT = 30; // degrees away from the user's own neutral pose
export const PITCH_LIMIT = 25;
export const EAR_CLOSED = 0.17; // eye aspect ratio below this = eyes closed (open eyes ~0.25-0.35)
export const EAR_CLOSED_RATIO = 0.6; // ...and below 60% of the user's own open-eye EAR
// (both: on a small/low-res face the measured "open" EAR can be as low as 0.05, D-046)
export const SUSTAIN_MS = 4000; // looking away / eyes closed for more than 4 s -> low focus
export const GAP_TOLERANCE_MS = 500; // a "looking back" shorter than this does not reset the timer
export const NEUTRAL_FRAMES = 100; // first 100 face frames (~10 s) define the neutral pose
const MAX_NEUTRAL_YAW = 20; // a camera on the side is fine, but a neutral beyond this is clamped
const MAX_NEUTRAL_PITCH = 25;

const DEG = 180 / Math.PI;

function pt(face, i, aspect) {
  const p = face[i];
  return { x: p.x, y: p.y / aspect, z: p.z ?? 0 };
}
const dist2d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Head yaw/pitch in degrees + eye aspect ratio for ONE frame.
 * yaw: + = the face edge on the image right is further from the camera (turned toward image left).
 * pitch: + = the chin is closer to the camera than the forehead (head tilted up), - = looking down.
 * aspect = videoWidth / videoHeight.
 */
export function headPose(face, aspect = 4 / 3) {
  if (!face || face.length < 468) return null;
  const L = pt(face, LM.faceLeft, aspect);
  const R = pt(face, LM.faceRight, aspect);
  const top = pt(face, LM.forehead, aspect);
  const chin = pt(face, LM.chin, aspect);
  // The face's horizontal axis (cheek to cheek) tilts in depth when the head turns.
  const yaw = Math.atan2(R.z - L.z, R.x - L.x) * DEG;
  // The vertical axis (forehead to chin) tilts in depth when the head nods.
  const pitch = Math.atan2(top.z - chin.z, chin.y - top.y) * DEG;
  return { yaw, pitch, ear: eyeAspectRatio(face, aspect) };
}

function earOne(face, eye, aspect) {
  const w = dist2d(pt(face, eye.outer, aspect), pt(face, eye.inner, aspect));
  if (w <= 1e-6) return null;
  const v = eye.top.reduce((s, t, k) => s + dist2d(pt(face, t, aspect), pt(face, eye.bottom[k], aspect)), 0);
  return v / (eye.top.length * w);
}

/** Mean eye aspect ratio (lid opening / eye width) of both eyes. */
export function eyeAspectRatio(face, aspect = 4 / 3) {
  const a = earOne(face, LM.rightEye, aspect);
  const b = earOne(face, LM.leftEye, aspect);
  if (a === null || b === null) return null;
  return (a + b) / 2;
}

export function median(values) {
  const v = values.filter((x) => x !== null && x !== undefined && !Number.isNaN(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

const clampAbs = (x, lim) => Math.max(-lim, Math.min(lim, x));

/** The user's own "looking at the screen" pose = median of the calibration frames. */
export function neutralPose(samples) {
  if (!samples.length) return null;
  return {
    yaw: clampAbs(median(samples.map((s) => s.yaw)), MAX_NEUTRAL_YAW),
    pitch: clampAbs(median(samples.map((s) => s.pitch)), MAX_NEUTRAL_PITCH),
    ear: median(samples.map((s) => s.ear)),
  };
}

/** Classify one frame against the user's neutral pose. Returns { away, closed, reason }.
 *  Without a neutral pose (still calibrating) nothing is flagged: the natural pitch differs a lot
 *  between people and camera positions (-21° vs -5° in our test clips). */
export function classifyPose(pose, neutral) {
  if (!pose || !neutral) return { away: false, closed: false, reason: null };
  const dy = Math.abs(pose.yaw - neutral.yaw);
  const dp = Math.abs(pose.pitch - neutral.pitch);
  const away = dy > YAW_LIMIT || dp > PITCH_LIMIT;
  const limit = neutral.ear ? Math.min(EAR_CLOSED, neutral.ear * EAR_CLOSED_RATIO) : EAR_CLOSED;
  const closed = pose.ear !== null && pose.ear < limit;
  let reason = null;
  if (closed) reason = "eyes";
  else if (away) reason = dp - PITCH_LIMIT > dy - YAW_LIMIT ? "pitch" : "side";
  return { away, closed, reason };
}

export const initialGazeState = () => ({ since: null, lastBadAt: null, sustained: false, reason: null });

/**
 * Per-frame timer: "bad" (looking away or eyes closed) must last more than SUSTAIN_MS.
 * A short glance back (< GAP_TOLERANCE_MS) does not reset it, a longer one does.
 * Returns the new state; state.sustained = trigger low focus now.
 */
export function stepGaze(state, cls, now) {
  const bad = cls.away || cls.closed;
  const s = { ...state };
  if (bad) {
    if (s.since === null) s.since = now;
    s.lastBadAt = now;
    s.reason = cls.reason;
  } else if (s.since !== null && now - s.lastBadAt > GAP_TOLERANCE_MS) {
    return initialGazeState();
  }
  s.sustained = s.since !== null && now - s.since > SUSTAIN_MS;
  return s;
}

export const GAZE_MESSAGES = {
  side: "נראה שאת מסתכלת הצידה",
  pitch: "נראה שהמבט שלך מופנה למטה או למעלה, לא למסך",
  eyes: "נראה שהעיניים שלך עצומות",
};
