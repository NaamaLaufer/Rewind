// Labeled input with hint + inline error (shown right under the field, linked via aria-describedby).
export default function Field({ id, label, error, hint, as = "input", children, ...props }) {
  const Tag = as;
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`field ${error ? "has-error" : ""}`}>
      <label htmlFor={id}>{label}</label>
      <Tag id={id} name={props.name ?? id} aria-invalid={!!error} aria-describedby={describedBy} {...props} />
      {hint && <div id={`${id}-hint`} className="field-hint">{hint}</div>}
      {children}
      {error && (
        <div id={`${id}-error`} className="field-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
