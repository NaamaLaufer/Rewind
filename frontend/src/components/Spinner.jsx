export default function Spinner({ label = "טוענת..." }) {
  return (
    <div className="spinner" role="status" aria-live="polite">
      {label}
    </div>
  );
}
