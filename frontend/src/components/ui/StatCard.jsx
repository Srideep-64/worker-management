export default function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  action,
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5 shadow-card transition-colors group-hover:border-accent group-hover:bg-accent/5">
      <div className="flex items-start justify-between">
        <p className="text-sm text-text-muted">{label}</p>
        {Icon && (
          <Icon
            className="h-4 w-4 text-text-muted"
            strokeWidth={1.75}
          />
        )}
      </div>

      <p className="mt-2 text-2xl font-semibold tabular-nums text-text">
        {value}
      </p>

      {hint && (
        <p className="mt-1 text-xs text-text-muted">{hint}</p>
      )}

      {action && (
        <div className="mt-4 border-t border-border pt-3">
          {action}
        </div>
      )}
    </div>
  );
}