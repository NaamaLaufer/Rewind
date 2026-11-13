export default function EmptyState({ title, children }) {
  return (
    <div className="card empty">
      <span className="cassette" aria-hidden="true">📼⏪</span>
      <h2>{title}</h2>
      {children}
    </div>
  );
}
