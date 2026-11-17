import { useEffect, useRef, useState } from "react";

/**
 * Accessible confirm dialog. If `requireText` is set, the user must type it to enable confirming.
 */
export default function ConfirmDialog({
  title, message, confirmLabel = "אישור", cancelLabel = "ביטול",
  danger = false, requireText = null, busy = false, error = null, onConfirm, onCancel,
}) {
  const [typed, setTyped] = useState("");
  const firstRef = useRef(null);
  useEffect(() => {
    firstRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && onCancel();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const blocked = busy || (requireText && typed.trim() !== requireText);
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-title" aria-describedby="dlg-msg">
        <h2 id="dlg-title">{title}</h2>
        <p id="dlg-msg">{message}</p>
        {requireText && (
          <div className="field">
            <label htmlFor="dlg-confirm">כדי לאשר, הקלידי: <strong>{requireText}</strong></label>
            <input id="dlg-confirm" ref={firstRef} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </div>
        )}
        {error && <div className="msg msg-error" role="alert">{error}</div>}
        <div className="row">
          <button type="button" ref={requireText ? undefined : firstRef}
            className={`btn ${danger ? "btn-danger" : "btn-primary"}`} disabled={blocked} onClick={onConfirm}>
            {busy ? "רגע..." : confirmLabel}
          </button>
          <button type="button" className="btn" onClick={onCancel}>{cancelLabel}</button>
        </div>
      </div>
    </div>
  );
}
