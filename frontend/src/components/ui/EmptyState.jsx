export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
      {Icon && <Icon className="mb-1 h-8 w-8 text-text-muted" strokeWidth={1.5} />}
      <p className="text-sm font-medium text-text">{title}</p>
      {description && <p className="max-w-sm text-sm text-text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
