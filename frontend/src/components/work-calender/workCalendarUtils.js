
export const CELL_TONE = {
  WORKED: "bg-success-soft text-success",
  ABSENT: "bg-danger-soft text-danger",
  HOLIDAY: "bg-info-soft text-info",
  WEEKLY_OFF: "bg-paper text-text-muted border border-border",
};

export const SHORT = {
  ABSENT: "A",
  HOLIDAY: "H",
  WEEKLY_OFF: "W",
};

export const STATUS_FROM_KEY = {
  A: "ABSENT",
  H: "HOLIDAY",
  W: "WEEKLY_OFF",
};

export const STATUS_LABEL = {
  WORKED: "Worked",
  ABSENT: "Absent",
  HOLIDAY: "Holiday",
  WEEKLY_OFF: "Weekly off",
};

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const pad = (n) => String(n).padStart(2, "0");

export const monthKey = (year, month) =>
  `${year}-${pad(month + 1)}`;

export function dateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}`;
}

export function parseDate(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function formatDate(key) {
  return parseDate(key).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatRole(role) {
  return role ? `${role.code} — ${role.name}` : "—";
}

export function formatStatus(status) {
  return STATUS_LABEL[status] ?? status ?? "—";
}

export function formatHours(hours) {
  return hours == null ? "—" : `${hours} hours`;
}

export function buildChanges(record, next, role) {
  const previous = {
    status: formatStatus(record.status),
    hours:
      record.status === "WORKED"
        ? formatHours(record.hours)
        : "—",
    role:
      record.status === "WORKED"
        ? formatRole(record.role)
        : "—",
  };

  const proposed = {
    status: formatStatus(next.status),
    hours:
      next.status === "WORKED"
        ? formatHours(next.hours)
        : "—",
    role:
      next.status === "WORKED"
        ? formatRole(role)
        : "—",
  };

  return [
    {
      key: "status",
      label: "Status",
      oldValue: previous.status,
      newValue: proposed.status,
    },
    {
      key: "hours",
      label: "Hours",
      oldValue: previous.hours,
      newValue: proposed.hours,
    },
    {
      key: "role",
      label: "Role",
      oldValue: previous.role,
      newValue: proposed.role,
    },
  ].filter((change) => change.oldValue !== change.newValue);
}
