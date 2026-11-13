// Extract the 11-char video id from any common YouTube URL shape. Mirrors the server regex.
const RE =
  /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/;

export function extractYouTubeId(url) {
  if (!url) return null;
  const m = String(url).trim().match(RE);
  return m ? m[1] : null;
}
