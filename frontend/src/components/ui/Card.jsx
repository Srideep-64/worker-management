export default function Card({ title, action, children, className = "" }) {
  return (
    <div className={`rounded-lg border border-border bg-surface shadow-card ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          {title && <h3 className="text-sm font-semibold text-text">{title}</h3>}
          {action}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}
