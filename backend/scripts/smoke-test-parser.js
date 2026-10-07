// Not part of the app — a one-off script to prove the parser behaves as the
// sample workbooks' inline comments claim, without needing a live database.
// Run with: node scripts/smoke-test-parser.js
import * as XLSX from "xlsx";
import path from "node:path";
import fs from "node:fs";
import { parseAndValidateWorkbook } from "../src/utils/timesheetParser.js";

const workersByCode = {
  A001: { id: "worker-A001" },
  A002: { id: "worker-A002" },
  A003: { id: "worker-A003" },
  A004: { id: "worker-A004" },
  A005: { id: "worker-A005" },
  // Note: B001 is deliberately NOT in this map — company A's validation
  // context only ever contains company A's own workers.
};
const clientsByCode = {
  "CL-001": { id: "client-1" },
  "CL-002": { id: "client-2" },
};
const rolesByCode = {
  ET: { id: "role-et" },
  PT: { id: "role-pt" },
  SF: { id: "role-sf" },
  MS: { id: "role-ms" },
  HP: { id: "role-hp" },
};

function run(fileName, periodDate, workersByCode) {
  const buf = new Uint8Array(fs.readFileSync(path.resolve("samples", fileName)));
  const workbook = XLSX.read(buf, { type: "array", cellDates: true });
  return parseAndValidateWorkbook(workbook, { periodDate, workersByCode, clientsByCode, rolesByCode });
}

// --- Wide format: Company A, September 2026 ---
const sept2026 = new Date(Date.UTC(2026, 8, 1));
const wide = run("sample-timesheet-wide-format.xlsx", sept2026, workersByCode);

console.log("=== WIDE FORMAT ===");
console.log("format:", wide.format);
// Note: this count includes records from rows that ALSO have other errors
// (e.g. A004's 29 valid days alongside its one blank-day error) — that's
// fine, because the controller only ever persists anything when errors.length
// is 0 for the whole file. A single bad cell still blocks the entire upload.
console.log("valid-looking records:", wide.records.length, "(irrelevant here — 7 errors block the whole file)");
console.log("errors:", wide.errors.length);
wide.errors.forEach((e) => console.log(`  row ${e.row} [${e.field}]: ${e.message}`));

// --- Daily format: Company B, September 2026 ---
const workersB = {
  B001: { id: "worker-B001" },
  B002: { id: "worker-B002" },
  B003: { id: "worker-B003" },
  B004: { id: "worker-B004" },
  B005: { id: "worker-B005" },
};
const daily = run("sample-timesheet-daily-format.xlsx", sept2026, workersB);

console.log("\n=== DAILY FORMAT ===");
console.log("format:", daily.format);
console.log("valid records:", daily.records.length, "(expect 3: B001 x2 + B002 x1)");
console.log("errors:", daily.errors.length);
daily.errors.forEach((e) => console.log(`  row ${e.row} [${e.field}]: ${e.message}`));

// --- Happy path: a fully valid daily-format file should produce 0 errors ---
const happyWb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(
  happyWb,
  XLSX.utils.aoa_to_sheet([
    ["WORKER_ID", "NAME", "CLIENT_ID", "DATE", "ROLE", "HOURS", "STATUS"],
    ["B001", "Worker B001", "CL-001", "2026-09-01", "ET", 8, "WORKED"],
    ["B002", "Worker B002", "CL-002", "2026-09-01", "MS", "", "HOLIDAY"],
  ]),
  "Sheet1"
);
const happy = parseAndValidateWorkbook(happyWb, {
  periodDate: sept2026,
  workersByCode: workersB,
  clientsByCode,
  rolesByCode,
});
console.log("\n=== HAPPY PATH (fully valid file) ===");
console.log("errors:", happy.errors.length, "(expect 0)");
console.log("records:", happy.records.length, "(expect 2)");
