import Badge from "./Badge.jsx";
import { daysUntil } from "../../hooks.js";

// Red: expired or within 30 days. Amber/accent: within 90 days. Green: fine.
export default function ExpiryBadge({ date, daysLeft }) {
  const d = daysLeft ?? daysUntil(date);
  if (d === null || d === undefined) return null;
  if (d < 0) return <Badge tone="danger">Expired {Math.abs(d)}d ago</Badge>;
  if (d <= 30) return <Badge tone="danger">{d === 0 ? "Expires today" : `${d}d left`}</Badge>;
  if (d <= 90) return <Badge tone="accent">{d}d left</Badge>;
  return <Badge tone="success">Valid</Badge>;
}
