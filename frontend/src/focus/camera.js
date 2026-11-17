// Camera helpers. Only `ideal` constraints, so virtual cameras (OBS) are never rejected.

export async function listCameras() {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === "videoinput")
    .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `מצלמה ${i + 1}` }));
}

const base = { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15 } };

export async function openCamera(deviceId) {
  if (!navigator.mediaDevices?.getUserMedia) {
    const e = new Error("הדפדפן הזה לא תומך במצלמה (או שהאתר לא נפתח ב-localhost / https)");
    e.name = "NotSupportedError";
    throw e;
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: deviceId ? { ...base, deviceId: { exact: deviceId } } : base,
      audio: false,
    });
  } catch (e) {
    // The chosen device disappeared or can't satisfy constraints -> any camera.
    if (deviceId && (e.name === "OverconstrainedError" || e.name === "NotFoundError")) {
      return navigator.mediaDevices.getUserMedia({ video: base, audio: false });
    }
    throw e;
  }
}

export function stopStream(stream) {
  stream?.getTracks().forEach((t) => t.stop());
}

/** Hebrew explanation for getUserMedia errors. */
export function cameraErrorMessage(e) {
  if (e?.name === "NotAllowedError" || e?.name === "SecurityError")
    return "לא קיבלנו גישה למצלמה, אז הסשן ממשיך בלי מדידה. אפשר לאפשר מצלמה בהגדרות הדפדפן ולנסות שוב.";
  if (e?.name === "NotFoundError")
    return "לא נמצאה מצלמה מחוברת. הסשן ממשיך בלי מדידה. אפשר לחבר מצלמה ולנסות שוב.";
  if (e?.name === "NotReadableError")
    return "המצלמה תפוסה על ידי תוכנה אחרת. סגרי אותה ונסי שוב. בינתיים הסשן ממשיך בלי מדידה.";
  return "לא הצלחנו להפעיל את המצלמה, אז הסשן ממשיך בלי מדידה. אפשר לנסות שוב.";
}
