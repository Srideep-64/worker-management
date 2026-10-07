import { z } from "zod";

export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "month must be YYYY-MM");

// [start, end) in UTC — work_date is a DATE column, always UTC midnight.
export function monthRange(str) {
  const [y, m] = str.split("-").map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) };
}

export function currentMonthString() {
  const n = new Date();
  return `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, "0")}`;
}
