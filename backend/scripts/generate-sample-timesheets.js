// Generates the two sample Excel workbooks used to exercise the importer,
// matching the workers/clients/roles the seed script creates. Run with:
//   node scripts/generate-sample-timesheets.js
// Outputs to backend/samples/.

import * as XLSX from "xlsx";
import path from "node:path";
import fs from "node:fs";

const OUT_DIR = path.resolve(process.cwd(), "samples");
fs.mkdirSync(OUT_DIR, { recursive: true });

function aoaToSheet(rows) {
  return XLSX.utils.aoa_to_sheet(rows);
}

// --- Format A: monthly wide, for Company A, September 2026 (30 days) ---

const wideHeader = [
  "WORKER_ID",
  "NAME",
  "ROLE",
  "CLIENT_ID",
  ...Array.from({ length: 31 }, (_, i) => i + 1),
];

// Exactly `n` cells (no padding) — the row simply ends short of column 31
// when a worker's data stops early, which the parser treats as "day doesn't
// apply" rather than an error, since day 31 doesn't exist in a 30-day month.
function eight(n) {
  return Array(n).fill(8);
}

const wideRows = [
  wideHeader,

  // Row 2 — VALID: full month (days 1–30), includes A/H/W shorthand + plain hours.
  ["OS42200", "Worker OS42200", "ET", "CL-001", 8, 8, "A", "H", "W", ...eight(25)],

  // Row 3 — VALID: decimal hours and an explicit 0-hour day (not a blank).
  ["OS42201", "Worker OS42201", "PT", "CL-002", 8.5, 0, ...eight(28)],

  // Row 4 — INVALID: old-style role code "E/T" is never auto-corrected.
  ["OS42202", "Worker OS42202", "E/T", "CL-001", ...eight(30)],

  // Row 5 — INVALID: day 10 is blank, which must NOT be treated as 0.
  ["OS42203", "Worker OS42203", "MS", "CL-002", ...eight(9), "", ...eight(20)],

  // Row 6 — INVALID: day 15 has 30 hours, outside the 0–24 range.
  ["OS42204", "Worker OS42204", "HP", "CL-001", ...eight(14), 30, ...eight(15)],

  // Row 7 — INVALID: OS52300 belongs to Company B, not Company A.
  ["OS52300", "Worker OS52300", "ET", "CL-001", ...eight(30)],

  // Row 8 — INVALID: OS42200 already appeared above; duplicate worker row.
  ["OS42200", "Worker OS42200", "ET", "CL-001", ...eight(30)],

  // Row 9 — INVALID: worker code doesn't exist at all.
  ["OS42999", "Nobody", "ET", "CL-001", ...eight(30)],
];

const overrideRows = [
  ["WORKER_ID", "DATE", "ROLE"],

  // VALID override: OS42201 works as SF (not their base PT) on 2026-09-05.
  ["OS42201", "2026-09-05", "SF"],

  // INVALID override: role code doesn't exist.
  ["OS42201", "2026-09-06", "P/T"],
];

const wideWb = XLSX.utils.book_new();

XLSX.utils.book_append_sheet(
  wideWb,
  aoaToSheet(wideRows),
  "Sheet1"
);

XLSX.utils.book_append_sheet(
  wideWb,
  aoaToSheet(overrideRows),
  "RoleOverrides"
);

XLSX.writeFile(
  wideWb,
  path.join(OUT_DIR, "sample-timesheet-wide-format.xlsx")
);

// --- Format B: daily normalized, for Company B, September 2026 ---

const dailyHeader = [
  "WORKER_ID",
  "NAME",
  "CLIENT_ID",
  "DATE",
  "ROLE",
  "HOURS",
  "STATUS",
];

const d = (day) => `2026-09-${String(day).padStart(2, "0")}`;

const dailyRows = [
  dailyHeader,

  // Row 2 — VALID: explicit WORKED status.
  ["OS52300", "Worker OS52300", "CL-001", d(1), "ET", 8, "WORKED"],

  // Row 3 — VALID: status inferred from hours alone (STATUS left blank).
  ["OS52300", "Worker OS52300", "CL-001", d(2), "ET", 8, ""],

  // Row 4 — VALID: ABSENT via shorthand, hours correctly left blank.
  ["OS52301", "Worker OS52301", "CL-002", d(1), "MS", "", "A"],

  // Row 5 — INVALID: duplicate of row 4 (same worker + same date).
  ["OS52301", "Worker OS52301", "CL-002", d(1), "MS", "", "A"],

  // Row 6 — INVALID: hours is text, not a number.
  ["OS52302", "Worker OS52302", "CL-001", d(3), "HP", "ten", "WORKED"],

  // Row 7 — INVALID: unparseable date.
  ["OS52303", "Worker OS52303", "CL-001", "notadate", "PT", 8, "WORKED"],

  // Row 8 — INVALID: unknown client code.
  ["OS52303", "Worker OS52303", "CL-999", d(4), "PT", 8, "WORKED"],

  // Row 9 — INVALID: worker code doesn't exist at all.
  ["OS52999", "Nobody", "CL-001", d(5), "ET", 8, "WORKED"],

  // Row 10 — INVALID: old-style role code.
  ["OS52304", "Worker OS52304", "CL-002", d(6), "M/S", 8, "WORKED"],
];

const dailyWb = XLSX.utils.book_new();

XLSX.utils.book_append_sheet(
  dailyWb,
  aoaToSheet(dailyRows),
  "Sheet1"
);

XLSX.writeFile(
  dailyWb,
  path.join(OUT_DIR, "sample-timesheet-daily-format.xlsx")
);

console.log(
  "Wrote samples/sample-timesheet-wide-format.xlsx and samples/sample-timesheet-daily-format.xlsx"
);

