import { z } from "zod";

export const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "month must be YYYY-MM");

// Half-open UTC range: [start, end).
export function monthRange(month) {
  const [year, monthNumber] = month.split("-").map(Number);

  return {
    start: new Date(Date.UTC(year, monthNumber - 1, 1)),
    end: new Date(Date.UTC(year, monthNumber, 1)),
  };
}

export function formatReportMonth(month) {
  const [year, monthNumber] = month.split("-");

  const monthName = new Date(
    Date.UTC(Number(year), Number(monthNumber) - 1, 1)
  ).toLocaleString("en-US", {
    month: "short",
    timeZone: "Asia/Dubai",
  });

  return `${monthName}-${year}`;
}

export function monthStartDate(month) {
  return monthRange(month).start;
}

export function daysInMonth(value) {
  const [year, monthNumber] =
    value instanceof Date
      ? [value.getUTCFullYear(), value.getUTCMonth() + 1]
      : value.split("-").map(Number);

  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

export function currentMonthString() {
  const now = new Date();

  return `${now.getUTCFullYear()}-${String(
    now.getUTCMonth() + 1,
  ).padStart(2, "0")}`;
}

export function getUaeDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );

  return {
    year: values.year,
    month: values.month,
    day: values.day,
  };
}

export function getUaeCalendarDates(date = new Date()) {
  const { year, month, day } = getUaeDateParts(date);

  return {
    today: `${year}-${month}-${day}`,
    monthStart: `${year}-${month}-01`,
  };
}

export function currentUaeMonthString() {
  const { year, month } = getUaeDateParts();
  return `${year}-${month}`;
}

// Format date-only values consistently without using server-local time.
export function dateOnly(value) {
  if (value == null || value === "") return null;

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));

    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return null;
    }

    return value;
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString().slice(0, 10);
}

export function dateKeyToUtcDate(value) {
  const key = dateOnly(value);
  return key ? new Date(`${key}T00:00:00.000Z`) : null;
}

export function getMonthStart(date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1),
  );
}

export function periodMonthToDate(periodMonth) {
  const [year, month] = periodMonth.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, 1));
}

export function isoDate(value) {
  return new Date(value).toISOString().slice(0, 10);
}