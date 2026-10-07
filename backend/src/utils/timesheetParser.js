import * as XLSX from "xlsx";

// A/H/W shorthand recognized in both formats (spec: "A = ABSENT, H = HOLIDAY,
// W = WEEKLY_OFF"). Never guessed or normalized beyond this exact mapping —
// anything else is a validation error, not a best-effort interpretation.
const SHORTHAND_STATUS = { A: "ABSENT", H: "HOLIDAY", W: "WEEKLY_OFF" };
const VALID_STATUS_WORDS = new Set(["WORKED", "ABSENT", "HOLIDAY", "WEEKLY_OFF"]);

function daysInMonth(periodDate) {
  return new Date(Date.UTC(periodDate.getUTCFullYear(), periodDate.getUTCMonth() + 1, 0)).getUTCDate();
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

// Array-of-arrays mode, rather than the object mode sheet_to_json normally
// offers, so header matching can be done case-insensitively (WORKER_ID vs
// worker_id vs Worker_Id) instead of requiring an exact key match.
function sheetToRows(sheet) {
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: undefined });
  const headerRow = (raw[0] || []).map((h) => (h === undefined || h === null ? "" : String(h).trim()));
  const dataRows = raw.slice(1);
  return { headerRow, dataRows };
}

function colIndex(headerRow, name) {
  return headerRow.findIndex((h) => h.toUpperCase() === name.toUpperCase());
}

function isBlankRow(row) {
  return !row || row.length === 0 || row.every((c) => c === undefined || c === "");
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
  const { headerRow } = sheetToRows(firstSheet);

  const hasDateColumn = colIndex(headerRow, "DATE") !== -1;
  const hasDayColumns = headerRow.some((h) => /^\d+$/.test(h));

  if (hasDateColumn) {
    return parseFormatDaily(firstSheet, context);
  }
  if (hasDayColumns) {
    const overrideSheetName = workbook.SheetNames.find((n) => /override/i.test(n));
    const overrideSheet = overrideSheetName ? workbook.Sheets[overrideSheetName] : null;
    return parseFormatWide(firstSheet, overrideSheet, context);
  }

  return {
    format: "UNKNOWN",
    errors: [
      {
        sheet: firstSheetName,
        row: 1,
        field: null,
        message:
          "Could not recognize this sheet as either the monthly wide format (numbered day columns, 1–31) or the daily format (a DATE column). Check the header row.",
      },
    ],
    records: [],
  };
}

// Parses a single day cell in the wide format, where one cell encodes either
// hours worked or a status shorthand. Distinguishes "blank" from "0" from
// "invalid" — the caller decides what each of those means.
function parseDayCellValue(raw) {
  if (raw === undefined || raw === null || raw === "") return { kind: "blank" };

  if (typeof raw === "number") {
    if (raw < 0 || raw > 24) return { kind: "error", message: `Hours ${raw} is out of the 0–24 range` };
    return { kind: "hours", value: raw };
  }

  const s = String(raw).trim().toUpperCase();
  if (s in SHORTHAND_STATUS) return { kind: "status", value: SHORTHAND_STATUS[s] };

  const asNumber = Number(s);
  if (s !== "" && !Number.isNaN(asNumber)) {
    if (asNumber < 0 || asNumber > 24) return { kind: "error", message: `Hours ${asNumber} is out of the 0–24 range` };
    return { kind: "hours", value: asNumber };
  }

  return { kind: "error", message: `"${raw}" is not recognized — expected a number of hours (0–24), or A/H/W` };
}

function parseFormatWide(sheet, overrideSheet, { periodDate, workersByCode, clientsByCode, rolesByCode }) {
  const { headerRow, dataRows } = sheetToRows(sheet);
  const idxWorkerId = colIndex(headerRow, "WORKER_ID");
  const idxRole = colIndex(headerRow, "ROLE");
  const idxClientId = colIndex(headerRow, "CLIENT_ID");
  const dayColumns = headerRow
    .map((h, i) => ({ day: Number(h), i }))
    .filter(({ i }) => /^\d+$/.test(headerRow[i]))
    .sort((a, b) => a.day - b.day);

  if (idxWorkerId === -1 || idxRole === -1 || idxClientId === -1) {
    return {
      format: "WIDE",
      errors: [
        {
          sheet: "Sheet1",
          row: 1,
          field: null,
          message: "Missing one of the required columns: WORKER_ID, ROLE, CLIENT_ID",
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
    const rowNum = i + 2; // +1 for 0-index, +1 for the header row

    const workerCode = row[idxWorkerId] !== undefined ? String(row[idxWorkerId]).trim() : "";
    const baseRoleCode = row[idxRole] !== undefined ? String(row[idxRole]).trim() : "";
    const clientCode = row[idxClientId] !== undefined ? String(row[idxClientId]).trim() : "";

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

    if (!clientCode) {
      errors.push({ sheet: "Sheet1", row: rowNum, field: "CLIENT_ID", message: "Missing client ID" });
      return;
    }
    const client = clientsByCode[clientCode];
    if (!client) {
      errors.push({ sheet: "Sheet1", row: rowNum, field: "CLIENT_ID", message: `Unknown client ID "${clientCode}"` });
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
      const overrideRole = overrides.get(`${workerCode}|${isoDate(workDate)}`);
      const roleCode = overrideRole || baseRoleCode;

      records.push({
        workerId: worker.id,
        clientId: client.id,
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

  const { headerRow, dataRows } = sheetToRows(overrideSheet);
  const idxWorker = colIndex(headerRow, "WORKER_ID");
  const idxDate = colIndex(headerRow, "DATE");
  const idxRole = colIndex(headerRow, "ROLE");

  if (idxWorker === -1 || idxDate === -1 || idxRole === -1) {
    errors.push({ sheet: "RoleOverrides", row: 1, field: null, message: "Role override sheet needs WORKER_ID, DATE and ROLE columns" });
    return overrides;
  }

  dataRows.forEach((row, i) => {
    if (isBlankRow(row)) return;
    const rowNum = i + 2;

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

function parseFormatDaily(sheet, { periodDate, workersByCode, clientsByCode, rolesByCode }) {
  const { headerRow, dataRows } = sheetToRows(sheet);
  const idx = {
    WORKER_ID: colIndex(headerRow, "WORKER_ID"),
    CLIENT_ID: colIndex(headerRow, "CLIENT_ID"),
    DATE: colIndex(headerRow, "DATE"),
    ROLE: colIndex(headerRow, "ROLE"),
    HOURS: colIndex(headerRow, "HOURS"),
    STATUS: colIndex(headerRow, "STATUS"),
  };
  const missing = Object.entries(idx).filter(([, v]) => v === -1).map(([k]) => k);
  if (missing.length) {
    return {
      format: "DAILY",
      errors: [{ sheet: "Sheet1", row: 1, field: null, message: `Missing required column(s): ${missing.join(", ")}` }],
      records: [],
    };
  }

  const errors = [];
  const records = [];
  const seenWorkerDate = new Set();
  const monthDays = daysInMonth(periodDate);
  const monthStart = new Date(Date.UTC(periodDate.getUTCFullYear(), periodDate.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(periodDate.getUTCFullYear(), periodDate.getUTCMonth(), monthDays));

  dataRows.forEach((row, i) => {
    if (isBlankRow(row)) return;
    const rowNum = i + 2;

    const workerCode = row[idx.WORKER_ID] !== undefined ? String(row[idx.WORKER_ID]).trim() : "";
    const clientCode = row[idx.CLIENT_ID] !== undefined ? String(row[idx.CLIENT_ID]).trim() : "";
    const roleCode = row[idx.ROLE] !== undefined ? String(row[idx.ROLE]).trim() : "";
    const dateRaw = row[idx.DATE];
    const hoursRaw = row[idx.HOURS];
    const statusRaw = row[idx.STATUS];

    if (!workerCode) {
      errors.push({ sheet: "Sheet1", row: rowNum, field: "WORKER_ID", message: "Missing worker ID" });
      return;
    }
    const worker = workersByCode[workerCode];
    if (!worker) {
      errors.push({ sheet: "Sheet1", row: rowNum, field: "WORKER_ID", message: `Unknown worker ID "${workerCode}" for this company` });
      return;
    }

    if (!clientCode) {
      errors.push({ sheet: "Sheet1", row: rowNum, field: "CLIENT_ID", message: "Missing client ID" });
      return;
    }
    const client = clientsByCode[clientCode];
    if (!client) {
      errors.push({ sheet: "Sheet1", row: rowNum, field: "CLIENT_ID", message: `Unknown client ID "${clientCode}"` });
      return;
    }

    if (dateRaw === undefined || dateRaw === "") {
      errors.push({ sheet: "Sheet1", row: rowNum, field: "DATE", message: "Missing date" });
      return;
    }
    const workDate = dateRaw instanceof Date ? dateRaw : new Date(dateRaw);
    if (Number.isNaN(workDate.getTime())) {
      errors.push({ sheet: "Sheet1", row: rowNum, field: "DATE", message: `Invalid date "${dateRaw}"` });
      return;
    }
    if (workDate < monthStart || workDate > monthEnd) {
      errors.push({ sheet: "Sheet1", row: rowNum, field: "DATE", message: `Date ${isoDate(workDate)} is outside the selected month` });
      return;
    }

    const dedupeKey = `${workerCode}|${isoDate(workDate)}`;
    if (seenWorkerDate.has(dedupeKey)) {
      errors.push({ sheet: "Sheet1", row: rowNum, field: "DATE", message: `Duplicate record for worker ${workerCode} on ${isoDate(workDate)}` });
      return;
    }
    seenWorkerDate.add(dedupeKey);

    if (!roleCode) {
      errors.push({ sheet: "Sheet1", row: rowNum, field: "ROLE", message: "Missing role" });
      return;
    }
    if (!(roleCode in rolesByCode)) {
      errors.push({ sheet: "Sheet1", row: rowNum, field: "ROLE", message: `Unknown role code "${roleCode}" — role codes are never auto-corrected` });
      return;
    }

    let status = statusRaw !== undefined && statusRaw !== "" ? String(statusRaw).trim().toUpperCase() : "";
    if (status in SHORTHAND_STATUS) status = SHORTHAND_STATUS[status];

    if (!status) {
      // No STATUS given at all. Rather than silently assuming WORKED, only
      // infer it when HOURS is unambiguously present — otherwise this is a
      // missing-value error like any other.
      if (hoursRaw === undefined || hoursRaw === "") {
        errors.push({ sheet: "Sheet1", row: rowNum, field: "STATUS", message: "Missing status (and no hours to infer WORKED from)" });
        return;
      }
      status = "WORKED";
    }
    if (!VALID_STATUS_WORDS.has(status)) {
      errors.push({ sheet: "Sheet1", row: rowNum, field: "STATUS", message: `Unrecognized status "${statusRaw}" — expected WORKED/ABSENT/HOLIDAY/WEEKLY_OFF or A/H/W` });
      return;
    }

    let hours = null;
    if (status === "WORKED") {
      if (hoursRaw === undefined || hoursRaw === "") {
        errors.push({ sheet: "Sheet1", row: rowNum, field: "HOURS", message: "Hours is required when status is WORKED" });
        return;
      }
      const n = Number(hoursRaw);
      if (Number.isNaN(n)) {
        errors.push({ sheet: "Sheet1", row: rowNum, field: "HOURS", message: `"${hoursRaw}" is not a number` });
        return;
      }
      if (n < 0 || n > 24) {
        errors.push({ sheet: "Sheet1", row: rowNum, field: "HOURS", message: `Hours ${n} is out of the 0–24 range` });
        return;
      }
      hours = n;
    } else if (hoursRaw !== undefined && hoursRaw !== "" && Number(hoursRaw) !== 0) {
      errors.push({ sheet: "Sheet1", row: rowNum, field: "HOURS", message: `Hours should be blank when status is ${status}` });
      return;
    }

    records.push({
      workerId: worker.id,
      clientId: client.id,
      roleId: rolesByCode[roleCode].id,
      workDate,
      hours,
      status,
    });
  });

  return { format: "DAILY", errors, records };
}
