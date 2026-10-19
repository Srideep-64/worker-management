import * as XLSX from "xlsx";
const SHORTHAND_STATUS = { A: "ABSENT", H: "HOLIDAY", W: "WEEKLY_OFF" };
import {
  daysInMonth,
  dateOnly,
  isoDate
} from "./dates.js";
import { getWorkerStatusForMonth } from "./workerStatus.js";

// Array-of-arrays mode, rather than the object mode sheet_to_json normally
// offers, so header matching can be done case-insensitively (WORKER_ID vs
// worker_id vs Worker_Id) instead of requiring an exact key match.

function sheetToRows(sheet) {
  const raw = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: undefined,
  });

  // Find the actual table header, allowing report title rows above it.
  const headerIndex = raw.findIndex((row) => {
    const headers = (row || []).map((cell) =>
      cell == null ? "" : String(cell).trim().toUpperCase()
    );

    const hasWorkerId = headers.includes("WORKER_ID") ||
      headers.includes("WORKER ID");

    const hasRole = headers.includes("ROLE");
    const hasDayColumns = headers.some((header) => /^\d+$/.test(header));

    return hasWorkerId && hasRole && hasDayColumns;
  });

  if (headerIndex === -1) {
    return {
      headerRow: (raw[0] || []).map((cell) =>
        cell == null ? "" : String(cell).trim()
      ),
      dataRows: raw.slice(1),
      headerIndex:0,
    };
  }

  const headerRow = (raw[headerIndex] || []).map((cell) =>
    cell == null ? "" : String(cell).trim()
  );

  return {
    headerRow,
    dataRows: raw.slice(headerIndex + 1),
    headerIndex,
  };
}


function colIndex(headerRow, name) {
  return headerRow.findIndex((h) => h.toUpperCase() === name.toUpperCase());
}

function isBlankRow(row) {
  return !row || row.length === 0 || row.every((c) => c === undefined || c === "");
}


function parseDayCellValue(raw) {
  if (raw === undefined || raw === null || raw === "") {
    return { kind: "blank" };
  }

  if (typeof raw === "number") {
    if (raw < 0 || raw > 24) {
      return {
        kind: "error",
        message: `Hours ${raw} is out of the 0–24 range`,
      };
    }

    return { kind: "hours", value: raw };
  }

  const s = String(raw).trim().toUpperCase();

  if (s in SHORTHAND_STATUS) {
    return { kind: "status", value: SHORTHAND_STATUS[s] };
  }

  const asNumber = Number(s);

  if (s !== "" && !Number.isNaN(asNumber)) {
    if (asNumber <= 0 || asNumber > 24) {
      return {
        kind: "error",
        message: `Hours ${asNumber} is out of the 0–24 range`,
      };
    }

    return { kind: "hours", value: asNumber };
  }

  return {
    kind: "error",
    message: `"${raw}" is not recognized — expected a number of hours (0–24), or A/H/W`,
  };
}

/**
 * Top-level entry point. Detects which of the two supported formats the
 * workbook's first sheet uses, then delegates. Never partially trusts a
 * file: every row is checked, and the caller is responsible for refusing to
 * commit anything at all if `errors` is non-empty.
 */
export function parseAndValidateWorkbook(workbook, context) {
  const firstSheetName = workbook.SheetNames[0];
  const firstSheet = workbook.Sheets[firstSheetName];

  if (!firstSheet) {
    return {
      format: "UNKNOWN",
      errors: [{
        sheet: firstSheetName || "Sheet1",
        row: 1,
        field: null,
        message: "Workbook has no readable first sheet.",
      }],
      records: [],
    };
  }

  const { headerRow} = sheetToRows(firstSheet);

  const hasDayColumns = headerRow.some((h) => /^\d+$/.test(h));

  if (!hasDayColumns) {
    return {
      format: "UNKNOWN",
      errors: [{
        sheet: firstSheetName,
        row: 1,
        field: null,
        message: "Expected a monthly attendance sheet with numbered day columns.",
      }],
      records: [],
    };
  }

  const overrideSheetName = workbook.SheetNames.find(
    (name) => /override/i.test(name)
  );

  const overrideSheet = overrideSheetName
    ? workbook.Sheets[overrideSheetName]
    : null;

  return parseFormatWide(firstSheet, overrideSheet, context);
}

function parseFormatWide(sheet, overrideSheet, { periodDate, workersByCode,  rolesByCode }) {
  const { headerRow, dataRows, headerIndex } = sheetToRows(sheet);
  const idxWorkerId =
    colIndex(headerRow, "WORKER_ID") !== -1
      ? colIndex(headerRow, "WORKER_ID")
      : colIndex(headerRow, "WORKER ID");

  const idxRole = colIndex(headerRow, "ROLE");
  
  const dayColumns = headerRow
    .map((h, i) => ({ day: Number(h), i }))
    .filter(({ i }) => /^\d+$/.test(headerRow[i]))
    .sort((a, b) => a.day - b.day);

  if (idxWorkerId === -1 || idxRole === -1 ) {
    return {
      format: "WIDE",
      errors: [
        {
          sheet: "Sheet1",
          row: 1,
          field: null,
          message: "Missing one of the required columns: WORKER_ID, ROLE",
        },
      ],
      records: [],
    };
  }

const errors = [];
const records = [];
const seenWorkerCodes = new Set();
const monthDays = daysInMonth(periodDate);
const year = periodDate.getUTCFullYear();
const month = periodDate.getUTCMonth();

// A monthly timesheet must contain every day of the selected month.
// Example:
// August -> 1 through 31
// September -> 1 through 30
const expectedDays = new Set(
  Array.from({ length: monthDays }, (_, i) => i + 1)
);

const actualDays = new Set(
  dayColumns.map(({ day }) => day)
);

const missingDays = [...expectedDays].filter(
  (day) => !actualDays.has(day)
);

if (missingDays.length > 0) {
  errors.push({
    sheet: "Sheet1",
    row: 1,
    field: "DAY_COLUMNS",
    message: `Missing required day column(s): ${missingDays.join(", ")}`,
  });
}
  const overrides = parseRoleOverrideSheet(overrideSheet, rolesByCode, errors);

  dataRows.forEach((row, i) => {
    if (isBlankRow(row)) return;
    const rowNum = i + headerIndex + 2; // +1 for 0-index, +1 for the header row

    const workerCode = row[idxWorkerId] !== undefined ? String(row[idxWorkerId]).trim() : "";
    const baseRoleCode = row[idxRole] !== undefined ? String(row[idxRole]).trim() : "";
   

    if (!workerCode) {
      errors.push({ sheet: "Sheet1", row: rowNum, field: "WORKER_ID", message: "Missing worker ID" });
      return;
    }
    if (seenWorkerCodes.has(workerCode)) {
      errors.push({ sheet: "Sheet1", row: rowNum, field: "WORKER_ID", message: `Duplicate row for worker ${workerCode} in this file` });
      return;
    }
    seenWorkerCodes.add(workerCode);

    const worker = workersByCode[workerCode];
    if (!worker) {
      errors.push({ sheet: "Sheet1", row: rowNum, field: "WORKER_ID", message: `Unknown worker ID "${workerCode}" for this company` });
      return;
    }

    if (getWorkerStatusForMonth(worker, dateOnly(periodDate)) !== "ACTIVE") {
  errors.push({
    sheet: "Sheet1",
    row: rowNum,
    field: "WORKER_ID",
    message: `Worker "${workerCode}" is not active for the selected reporting month`,
  });
  return;
}

    if (!baseRoleCode) {
      errors.push({ sheet: "Sheet1", row: rowNum, field: "ROLE", message: "Missing role" });
      return;
    }
    if (!(baseRoleCode in rolesByCode)) {
      errors.push({ sheet: "Sheet1", row: rowNum, field: "ROLE", message: `Unknown role code "${baseRoleCode}" — role codes are never auto-corrected` });
      return;
    }

    for (const { day, i: colI } of dayColumns) {
      const cellRaw = row[colI];

      if (day > monthDays) {
        if (cellRaw !== undefined && cellRaw !== "") {
          errors.push({ sheet: "Sheet1", row: rowNum, field: `Day ${day}`, message: `Day ${day} does not exist in this month` });
        }
        continue;
      }

      const parsed = parseDayCellValue(cellRaw);
      if (parsed.kind === "blank") {
        errors.push({ sheet: "Sheet1", row: rowNum, field: `Day ${day}`, message: `Missing value for day ${day} — blanks are never treated as 0` });
        continue;
      }
      if (parsed.kind === "error") {
        errors.push({ sheet: "Sheet1", row: rowNum, field: `Day ${day}`, message: parsed.message });
        continue;
      }

      const workDate = new Date(Date.UTC(year, month, day));

      const requestedWorkDate = isoDate(workDate);

      const joiningDate = worker.joiningDate
        ? isoDate(new Date(worker.joiningDate))
        : null;

      const leavingDate = worker.leavingDate
        ? isoDate(new Date(worker.leavingDate))
        : null;

      if (joiningDate && requestedWorkDate < joiningDate) {
        errors.push({
          sheet: "Sheet1",
          row: rowNum,
          field: `Day ${day}`,
          message: `Cannot add a work record for ${worker.name} dated ${requestedWorkDate}. The worker's joining date is ${joiningDate}.`,
        });
        continue;
      }

      if (leavingDate && requestedWorkDate > leavingDate) {
        errors.push({
          sheet: "Sheet1",
          row: rowNum,
          field: `Day ${day}`,
          message: `Cannot add a work record for ${worker.name} dated ${requestedWorkDate}. The worker's leaving date is ${leavingDate}.`,
        });
        continue;
      }
      const overrideRole = overrides.get(`${workerCode}|${isoDate(workDate)}`);
      const roleCode = overrideRole || baseRoleCode;

      records.push({
        workerId: worker.id,
        roleId: rolesByCode[roleCode].id,
        workDate,
        hours: parsed.kind === "hours" ? parsed.value : null,
        status: parsed.kind === "hours" ? "WORKED" : parsed.value,
      });
    }
  });

  return { format: "WIDE", errors, records };
}

// The role-override sheet (any sheet whose name contains "override",
// case-insensitive) lets a worker's role differ from their base ROLE column
// on specific days — the wide format's answer to "a worker can perform
// different roles on different days" without needing Format B.
function parseRoleOverrideSheet(overrideSheet, rolesByCode, errors) {
  const overrides = new Map();
  if (!overrideSheet) return overrides;

  const { headerRow, dataRows, headerIndex } = sheetToRows(overrideSheet);
  const idxWorker = colIndex(headerRow, "WORKER_ID");
  const idxDate = colIndex(headerRow, "DATE");
  const idxRole = colIndex(headerRow, "ROLE");

  if (idxWorker === -1 || idxDate === -1 || idxRole === -1) {
    errors.push({ sheet: "RoleOverrides", row: 1, field: null, message: "Role override sheet needs WORKER_ID, DATE and ROLE columns" });
    return overrides;
  }

  dataRows.forEach((row, i) => {
    if (isBlankRow(row)) return;
    const rowNum = i + headerIndex + 2;

    const workerCode = row[idxWorker] !== undefined ? String(row[idxWorker]).trim() : "";
    const roleCode = row[idxRole] !== undefined ? String(row[idxRole]).trim() : "";
    const dateRaw = row[idxDate];

    if (!workerCode || !roleCode || dateRaw === undefined) {
      errors.push({ sheet: "RoleOverrides", row: rowNum, field: null, message: "Role override rows need WORKER_ID, DATE and ROLE" });
      return;
    }

    const date = dateRaw instanceof Date ? dateRaw : new Date(dateRaw);
    if (Number.isNaN(date.getTime())) {
      errors.push({ sheet: "RoleOverrides", row: rowNum, field: "DATE", message: `Invalid date "${dateRaw}"` });
      return;
    }
    if (!(roleCode in rolesByCode)) {
      errors.push({ sheet: "RoleOverrides", row: rowNum, field: "ROLE", message: `Unknown role code "${roleCode}"` });
      return;
    }

    overrides.set(`${workerCode}|${isoDate(date)}`, roleCode);
  });

  return overrides;
}
