import { useEffect, useState } from "react";
import { api } from "../api/client.js";

/** Gemini "quick check" question about the paragraph the reader just lost focus on. */
export default function QuestionDialog({ contentId, paragraphIndex, onClose }) {
  const [q, setQ] = useState(null);
  const [error, setError] = useState(null);
  const [picked, setPicked] = useState(null);

  useEffect(() => {
    api("/ai/check-question", { method: "POST", body: { content_id: contentId, paragraph_index: paragraphIndex } })
      .then(setQ)
      .catch((e) => setError(e.message));
  }, [contentId, paragraphIndex]);

  return (
    <div className="dialog-backdrop">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="q-title">
        <h2 id="q-title">שאלת בדיקה קצרה</h2>
        {!q && !error && <p role="status">מכינה שאלה על הפסקה...</p>}
        {error && <div className="msg msg-error" role="alert">{error}</div>}
        {q && (
          <>
            <p><strong>{q.question}</strong></p>
            <div className="stack">
              {q.options.map((o, i) => (
                <button key={i} type="button" className={`btn btn-block ${picked === null ? "" : i === q.answer_index ? "btn-mint" : i === picked ? "btn-danger" : ""}`}
                  disabled={picked !== null} onClick={() => setPicked(i)}>
                  {o}
                </button>
              ))}
            </div>
            {picked !== null && (
              <p className="msg msg-info" role="status" style={{ marginTop: 12 }}>
                {picked === q.answer_index ? "נכון! ממשיכות." : "לא בדיוק. כדאי לקרוא שוב את הפסקה."}
              </p>
            )}
          </>
        )}
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={onClose}>חזרה לקריאה</button>
        </div>
      </div>
    </div>
  );
}
