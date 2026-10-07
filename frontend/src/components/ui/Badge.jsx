const TONE_CLASSES = {
  success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  accent: "bg-accent-soft text-accent-dark",
  neutral: "bg-paper text-text-muted border border-border",
};

// Maps domain statuses to a visual tone so the same status always reads
// the same way anywhere in the app (work calendar, timesheets list, etc.)
const STATUS_TONE = {
  WORKED: "success",
  ABSENT: "danger",
  HOLIDAY: "info",
  WEEKLY_OFF: "neutral",
  ACTIVE: "success",
  PROCESSING: "accent",
  SUPERSEDED: "neutral",
  FAILED: "danger",
};

export default function Badge({ children, tone, status }) {
  const resolvedTone = tone || STATUS_TONE[status] || "neutral";
  return (
    <span
      className={`inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[resolvedTone]}`}
    >
      {children ?? status}
    </span>
  );
}
