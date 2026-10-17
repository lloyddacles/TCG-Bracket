export default function Spinner({ full = false, label = 'Loading…' }) {
  const content = (
    <div className="spinner" role="status" aria-live="polite">
      <div className="spinner-ring" />
      <span>{label}</span>
    </div>
  );
  if (full) return <div className="spinner-full">{content}</div>;
  return content;
}
