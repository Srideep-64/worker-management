import * as XLSX from "xlsx";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { saveFile, readFile } from "../lib/storage.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { parseAndValidateWorkbook } from "../utils/timesheetParser.js";
import { logActivity, monthLabel } from "../lib/activityLog.js";
import {
  currentUaeMonthString,
  monthRange,
  periodMonthToDate,
  monthSchema,
} from "../utils/dates.js";
import { lockCompanyMonth } from "../utils/locks.js";

// Lists sent to the browser are capped; the full list is available as CSV.
const PREVIEW_LIST_LIMIT = 200;
// A PROCESSING upload nobody confirmed is treated as abandoned after this long.
const STALE_PROCESSING_HOURS = 24;

export const TIMESHEET_STATUSES = [
  "PROCESSING",
  "ACTIVE",
  "SUPERSEDED",
  "FAILED",
  "CANCELLED",
  "NO_CHANGES",
];

export const uploadBodySchema = z.object({
  companyId: z.string().uuid(),
  periodMonth: monthSchema,
});

export const confirmBodySchema = z.object({
  replace: z.coerce.boolean().optional().default(false),
});

export const listQuerySchema = z.object({
  companyId: z.string().uuid().optional(),
  status: z.enum(TIMESHEET_STATUSES).optional(),
  month: monthSchema.optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});

function assertPeriodMonthNotInFuture(periodMonth) {
  const currentMonth = currentUaeMonthString();

  if (periodMonth > currentMonth) {
    throw ApiError.badRequest(
      `Cannot upload a timesheet for a future reporting month (${periodMonth}). The current UAE reporting month is ${currentMonth}.`,
    );
  }
}

// Loads everything the parser needs to resolve business identifiers
// (worker_code, role code) to database IDs, scoped so a
// worker from a different company can never silently match by code.
async function loadValidationContext(companyId) {
  const [workers, roles] = await Promise.all([
    prisma.worker.findMany({
      where: { companyId },
      select: {
        id: true,
        workerCode: true,
        name: true,
        joiningDate: true,
        leavingDate: true,
      },
    }),
    prisma.role.findMany({
      select: { id: true, code: true, name: true },
    }),
  ]);

  return {
    workersByCode: Object.fromEntries(
      workers.map((worker) => [worker.workerCode, worker]),
    ),
    rolesByCode: Object.fromEntries(roles.map((role) => [role.code, role])),
  };
}

function roleCodes(context) {
  return Object.fromEntries(
    Object.values(context.rolesByCode).map((role) => [role.id, role.code]),
  );
}

function buildPreview(records, context) {
  const workersById = Object.fromEntries(
    Object.values(context.workersByCode).map((worker) => [worker.id, worker]),
  );
  const rolesById = Object.fromEntries(
    Object.values(context.rolesByCode).map((role) => [role.id, role]),
  );

  return records.slice(0, 10).map((record) => {
    const worker = workersById[record.workerId];
    const role = rolesById[record.roleId];

    return {
      workerId: worker?.workerCode ?? record.workerId,
      workerName: worker?.name ?? "Unknown worker",
      role: role?.code ?? record.roleId,
      roleName: role?.name ?? "Unknown role",
      workDate: record.workDate,
      hours: record.hours,
      status: record.status,
    };
  });
}

function workDateKey(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function getTimesheetRecordKey(record) {
  return `${record.workerId}:${workDateKey(record.workDate)}`;
}

function getRecordSnapshot(record) {
  return {
    roleId: record.roleId,
    hours: Number(record.hours),
    status: record.status,
  };
}

function compareTimesheetRecords(previousRecords, uploadedRecords, context) {
  const workersById = Object.fromEntries(
    Object.values(context.workersByCode).map((worker) => [worker.id, worker]),
  );
  const rolesById = Object.fromEntries(
    Object.values(context.rolesByCode).map((role) => [role.id, role]),
  );

  const previousByKey = new Map(
    previousRecords.map((record) => [getTimesheetRecordKey(record), record]),
  );
  const uploadedByKey = new Map(
    uploadedRecords.map((record) => [getTimesheetRecordKey(record), record]),
  );

  const changes = [];

  function describeChange(type, previous, uploaded) {
    const record = uploaded ?? previous;
    const worker = workersById[record.workerId];

    return {
      type,
      workerId: record.workerId,
      workerCode: worker?.workerCode ?? "Unknown",
      workerName: worker?.name ?? "Unknown worker",
      workDate: workDateKey(record.workDate),
      previous: previous
        ? {
            ...getRecordSnapshot(previous),
            role: rolesById[previous.roleId]?.code ?? "Unknown",
          }
        : null,
      uploaded: uploaded
        ? {
            ...getRecordSnapshot(uploaded),
            role: rolesById[uploaded.roleId]?.code ?? "Unknown",
          }
        : null,
    };
  }

  for (const [key, uploaded] of uploadedByKey) {
    const previous = previousByKey.get(key);

    if (!previous) {
      changes.push(describeChange("ADDED", null, uploaded));
      continue;
    }

    const oldSnapshot = getRecordSnapshot(previous);
    const newSnapshot = getRecordSnapshot(uploaded);

    if (
      oldSnapshot.roleId !== newSnapshot.roleId ||
      oldSnapshot.hours !== newSnapshot.hours ||
      oldSnapshot.status !== newSnapshot.status
    ) {
      changes.push(describeChange("CHANGED", previous, uploaded));
    }
  }

  for (const [key, previous] of previousByKey) {
    if (!uploadedByKey.has(key)) {
      changes.push(describeChange("REMOVED", previous, null));
    }
  }

  return changes;
}

function sameValues(manual, uploaded) {
  return (
    manual.roleId === uploaded.roleId &&
    Number(manual.hours ?? 0) === Number(uploaded.hours ?? 0) &&
    manual.status === uploaded.status
  );
}

// Manual records whose worker AND date appear in the uploaded timesheet.
// - conflicts: values differ, so the user has to resolve them.
// - identicalKeys/identicalIds: same role/hours/status; nothing to resolve.
//   On confirm these manual records are re-labelled as TIMESHEET records of
//   the new upload (updated, never deleted) and the uploaded row is not
//   inserted again.
// Other manual entries in the month are untouched.
async function findManualConflicts({
  records,
  companyId,
  periodMonth,
  roleCodeById,
  db = prisma,
}) {
  if (!records.length) {
    return { conflicts: [], identicalKeys: new Set(), identicalIds: [] };
  }

  const workerIds = [...new Set(records.map((record) => record.workerId))];
  const { start, end } = monthRange(periodMonth);

  const manualRecords = await db.workRecord.findMany({
    where: {
      source: "MANUAL",
      worker: { companyId },
      workerId: { in: workerIds },
      workDate: { gte: start, lt: end },
    },
    select: {
      id: true,
      workerId: true,
      workDate: true,
      roleId: true,
      hours: true,
      status: true,
      worker: { select: { workerCode: true, name: true } },
    },
  });

  const uploadedByPair = new Map(
    records.map((record) => [getTimesheetRecordKey(record), record]),
  );

  const conflicts = [];
  const identicalKeys = new Set();
  const identicalIds = [];

  for (const manual of manualRecords) {
    const key = getTimesheetRecordKey(manual);
    const uploaded = uploadedByPair.get(key);
    if (!uploaded) continue;

    if (sameValues(manual, uploaded)) {
      identicalKeys.add(key);
      identicalIds.push(manual.id);
      continue;
    }

    conflicts.push({
      id: manual.id,
      workerId: manual.workerId,
      workerCode: manual.worker.workerCode,
      workerName: manual.worker.name,
      workDate: workDateKey(manual.workDate),
      existingRole: roleCodeById[manual.roleId] ?? "Unknown",
      existingHours: manual.hours,
      existingStatus: manual.status,
      uploadedRole: roleCodeById[uploaded.roleId] ?? "Unknown",
      uploadedHours: uploaded.hours,
      uploadedStatus: uploaded.status,
    });
  }

  return { conflicts, identicalKeys, identicalIds };
}

// Uploaded rows that duplicate an identical manual record are not "new data".
function dropIdenticalAdditions(changes, identicalKeys) {
  return changes.filter(
    (c) =>
      !(c.type === "ADDED" && identicalKeys.has(`${c.workerId}:${c.workDate}`)),
  );
}

function summarizeChanges(changes) {
  const summary = {
    added: 0,
    changed: 0,
    removed: 0,
    workersAdded: 0,
    workersChanged: 0,
    workersRemoved: 0,
  };
  const workers = { added: new Set(), changed: new Set(), removed: new Set() };

  for (const change of changes ?? []) {
    const type = change.type.toLowerCase();
    summary[type] += 1;
    workers[type].add(change.workerId);
  }

  summary.workersAdded = workers.added.size;
  summary.workersChanged = workers.changed.size;
  summary.workersRemoved = workers.removed.size;
  return summary;
}

const capList = (list) => list.slice(0, PREVIEW_LIST_LIMIT);

// Everything the preview, the confirm step and the CSV need to know about an
// upload: the ACTIVE timesheet it would replace, how it differs from it, and
// which manual records overlap it. `db` lets confirm run it inside its
// transaction so the decision and the writes see the same data.
async function analyzeUpload({
  records,
  companyId,
  periodDate,
  periodMonth,
  context,
  excludeUploadId,
  db = prisma,
}) {
  const existingActive = await db.timesheetUpload.findFirst({
    where: {
      companyId,
      periodMonth: periodDate,
      status: "ACTIVE",
      ...(excludeUploadId ? { NOT: { id: excludeUploadId } } : {}),
    },
  });

  const overlap = await findManualConflicts({
    records,
    companyId,
    periodMonth,
    roleCodeById: roleCodes(context),
    db,
  });

  let changes = null;

  if (existingActive) {
    const previousRecords = await db.workRecord.findMany({
      where: { uploadId: existingActive.id },
      select: {
        workerId: true,
        workDate: true,
        roleId: true,
        hours: true,
        status: true,
      },
    });

    changes = dropIdenticalAdditions(
      compareTimesheetRecords(previousRecords, records, context),
      overlap.identicalKeys,
    );
  }

  return { existingActive, overlap, changes };
}

function readWorkbookOrThrow(buffer) {
  try {
    return XLSX.read(buffer, { type: "buffer", cellDates: true });
  } catch {
    throw ApiError.badRequest("Could not read this file as an Excel workbook");
  }
}

// Previews nobody confirmed or cancelled are marked CANCELLED once stale.
async function expireStaleUploads() {
  const cutoff = new Date(Date.now() - STALE_PROCESSING_HOURS * 3600 * 1000);

  await prisma.timesheetUpload.updateMany({
    where: { status: "PROCESSING", uploadedAt: { lt: cutoff } },
    data: { status: "CANCELLED" },
  });
}

// POST /api/timesheets/upload
// Parses, validates and stores the file, but never writes a single
// work_record here — that only happens in confirmTimesheet, after the
// caller has seen the preview/errors and explicitly confirmed.
export const uploadTimesheet = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw ApiError.badRequest("An .xlsx/.xls file is required (field name 'file')");
  }
  const { companyId, periodMonth } = uploadBodySchema.parse(req.body);

  assertPeriodMonthNotInFuture(periodMonth);

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) {
    throw ApiError.badRequest("companyId does not reference an existing company");
  }

  await expireStaleUploads();

  const periodDate = periodMonthToDate(periodMonth);
  const context = await loadValidationContext(companyId);
  const workbook = readWorkbookOrThrow(req.file.buffer);
  const { format, errors, records } = parseAndValidateWorkbook(workbook, {
    periodDate,
    ...context,
  });

  // The file is kept regardless of outcome (including FAILED) so a rejected
  // upload can still be reviewed later.
  const storageKey = await saveFile(req.file.buffer, {
    prefix: `timesheets/${company.code}`,
    filename: req.file.originalname,
  });

  const upload = await prisma.timesheetUpload.create({
    data: {
      companyId,
      periodMonth: periodDate,
      originalFilename: req.file.originalname,
      storageKey,
      uploadedById: req.user.id,
      status: errors.length > 0 ? "FAILED" : "PROCESSING",
      rowCount: records.length,
      errorCount: errors.length,
    },
  });

  if (errors.length > 0) {
    return res.status(422).json({ upload, valid: false, format, errors });
  }

  // A new preview replaces this user's earlier unconfirmed preview for the
  // same company and month.
  await prisma.timesheetUpload.updateMany({
    where: {
      companyId,
      periodMonth: periodDate,
      uploadedById: req.user.id,
      status: "PROCESSING",
      NOT: { id: upload.id },
    },
    data: { status: "CANCELLED" },
  });

  const { existingActive, overlap, changes } = await analyzeUpload({
    records,
    companyId,
    periodDate,
    periodMonth,
    context,
  });

  const hasUsefulChanges = !existingActive || changes.length > 0;

  // An upload identical to the active timesheet can never be confirmed, so
  // record that outcome instead of leaving it PROCESSING.
  const currentUpload = hasUsefulChanges
    ? upload
    : await prisma.timesheetUpload.update({
        where: { id: upload.id },
        data: { status: "NO_CHANGES" },
      });

  const removed = (changes ?? []).filter((c) => c.type === "REMOVED");
  const shownChanges = (changes ?? []).filter((c) => c.type !== "REMOVED");
  const converted = overlap.identicalKeys.size;

  res.json({
    upload: currentUpload,
    valid: true,
    format,
    rowCount: records.length,
    requiresConfirmation: true,
    canImport:
      hasUsefulChanges && removed.length === 0 && overlap.conflicts.length === 0,
    hasUsefulChanges,
    summary: {
      totalRows: records.length,
      rowsToCreate: records.length - converted,
      manualToRelabel: converted,
      ...summarizeChanges(changes),
    },
    timesheetChanges: changes ? capList(shownChanges) : null,
    timesheetChangesTotal: shownChanges.length,
    removedRecords: capList(removed),
    removedCount: removed.length,
    manualConflicts: capList(overlap.conflicts),
    manualConflictCount: overlap.conflicts.length,
    identicalManualCount: converted,
    supersedesActiveTimesheet: Boolean(existingActive),
    conflict: existingActive
      ? {
          existingUploadId: existingActive.id,
          uploadedAt: existingActive.uploadedAt,
          rowCount: existingActive.rowCount,
        }
      : null,
    preview: buildPreview(records, context),
  });
});

// POST /api/timesheets/:id/confirm
// Re-reads the stored file and re-validates from scratch rather than
// trusting anything cached from the upload step. Every decision (is there an
// ACTIVE timesheet, what differs, which manual records overlap) is made inside
// the transaction that performs the writes, so two people confirming at once
// can't both succeed. A partial unique index on ACTIVE uploads backs this up.
export const confirmTimesheet = asyncHandler(async (req, res) => {
  const { replace } = confirmBodySchema.parse(req.body);

  const upload = await prisma.timesheetUpload.findUnique({
    where: { id: req.params.id },
    include: { company: { select: { id: true, code: true, name: true } } },
  });
  if (!upload) throw ApiError.notFound("Timesheet upload not found");
  if (upload.status !== "PROCESSING") {
    throw ApiError.conflict(
      `This upload is already ${upload.status.toLowerCase().replace("_", " ")} and cannot be confirmed again`,
    );
  }

  const periodMonth = upload.periodMonth.toISOString().slice(0, 7);
  assertPeriodMonthNotInFuture(periodMonth);

  const context = await loadValidationContext(upload.companyId);
  const fileBuffer = await readFile(upload.storageKey);
  const workbook = readWorkbookOrThrow(fileBuffer);
  const { errors, records } = parseAndValidateWorkbook(workbook, {
    periodDate: upload.periodMonth,
    ...context,
  });

  if (errors.length > 0) {
    await prisma.timesheetUpload.update({
      where: { id: upload.id },
      data: { status: "FAILED", errorCount: errors.length },
    });
    return res.status(422).json({ valid: false, errors });
  }

  let outcome;

  try {
    outcome = await prisma.$transaction(
      async (tx) => {
        await lockCompanyMonth(tx, upload.companyId, periodMonth, "exclusive");
        // Claim the upload. The no-op UPDATE takes the row lock, so a second
        // confirm (double click, other tab) waits, then finds it processed.
        const claimed = await tx.timesheetUpload.updateMany({
          where: { id: upload.id, status: "PROCESSING" },
          data: { status: "PROCESSING" },
        });
        if (claimed.count !== 1) {
          throw ApiError.conflict("This upload was already processed or cancelled.");
        }

        const { existingActive, overlap, changes } = await analyzeUpload({
          records,
          companyId: upload.companyId,
          periodDate: upload.periodMonth,
          periodMonth,
          context,
          excludeUploadId: upload.id,
          db: tx,
        });

        if (existingActive && !replace) {
          throw ApiError.conflict(
            "An ACTIVE timesheet already exists for this company and month. Resend with replace=true to supersede it.",
            { existingUploadId: existingActive.id },
          );
        }

        if (existingActive && changes.length === 0) {
          return { kind: "NO_CHANGES" };
        }

        // Uploads never delete data: records that exist in the active
        // timesheet but are missing from this file must be merged in first.
        const removed = (changes ?? []).filter((c) => c.type === "REMOVED");
        if (removed.length > 0) {
          throw ApiError.conflict(
            "This upload is missing records from the active timesheet. Download the active timesheet, merge your changes into it, and upload the merged file.",
            {
              existingUploadId: existingActive.id,
              removedRecords: capList(removed),
              removedCount: removed.length,
            },
          );
        }

        if (overlap.conflicts.length > 0) {
          throw ApiError.conflict(
            "This timesheet overlaps with existing manual work records. Remove those rows from the file or resolve the manual records, then upload again.",
            {
              manualConflicts: capList(overlap.conflicts),
              manualConflictCount: overlap.conflicts.length,
            },
          );
        }

        if (existingActive) {
          await tx.workRecord.deleteMany({
            where: { uploadId: existingActive.id },
          });
          await tx.timesheetUpload.update({
            where: { id: existingActive.id },
            data: { status: "SUPERSEDED", supersededById: upload.id },
          });
        }

        // Identical manual records become part of this timesheet (same row,
        // new owner) instead of being inserted a second time.
        if (overlap.identicalIds.length > 0) {
          await tx.workRecord.updateMany({
            where: { id: { in: overlap.identicalIds }, source: "MANUAL" },
            data: { source: "TIMESHEET", uploadId: upload.id },
          });
        }

        const recordsToInsert = records.filter(
          (r) => !overlap.identicalKeys.has(getTimesheetRecordKey(r)),
        );

        if (recordsToInsert.length > 0) {
          await tx.workRecord.createMany({
            data: recordsToInsert.map((r) => ({
              ...r,
              uploadId: upload.id,
              source: "TIMESHEET",
            })),
          });
        }

        const activated = await tx.timesheetUpload.update({
          where: { id: upload.id },
          data: {
            status: "ACTIVE",
            rowCount: records.length,
            errorCount: 0,
            recordsCreated: recordsToInsert.length,
            recordsConverted: overlap.identicalIds.length,
            confirmedAt: new Date(),
          },
        });

        return {
          kind: "IMPORTED",
          activated,
          created: recordsToInsert.length,
          converted: overlap.identicalIds.length,
          supersededUploadId: existingActive?.id ?? null,
          changeSummary:summarizeChanges(changes),
        };
      },
      { maxWait: 10000, timeout: 30000 },
    );
  } catch (err) {
    // Unique-index violation: another upload became ACTIVE first.
    if (err?.code === "P2002") {
      const target = JSON.stringify(err.meta?.target ?? "");
      if (target.includes("work_date") || target.includes("workDate")) {
        throw ApiError.conflict(
          "A work record was added for one of these workers and dates while you were confirming. Upload the file again to review the latest data.",
        );
      }
      throw ApiError.conflict(
        "Another timesheet was activated for this company and month while you were confirming. Upload the file again to review the latest data.",
      );
    }
    throw err;
  }

  if (outcome.kind === "NO_CHANGES") {
    await prisma.timesheetUpload.update({
      where: { id: upload.id },
      data: { status: "NO_CHANGES" },
    });
    throw ApiError.conflict("The timesheet does not update any data.");
  }
    const cs = outcome.changeSummary;
  const detail = outcome.supersededUploadId
    ? `${cs.added} added, ${cs.changed} changed, ${Math.max(0, records.length - cs.added - cs.changed)} unchanged`
    : `${outcome.created} records created`;

  await logActivity({
    user: req.user,
    category: "TIMESHEETS",
    action: outcome.supersededUploadId ? "REPLACE" : "UPLOAD",
    description:
      `Uploaded timesheet "${upload.originalFilename}" for ${upload.company.name} for ${monthLabel(periodMonth)}` +
      (outcome.supersededUploadId ? ", replacing the previous timesheet" : "") +
      `. ${detail}` +
      (outcome.converted ? `, ${outcome.converted} manual records converted.` : "."),
    companyId: upload.companyId,
    entityType: "TimesheetUpload",
    entityId: upload.id,
    metadata: {
      month: periodMonth,
      filename: upload.originalFilename,
      rowCount: records.length,
      created: outcome.created,
      converted: outcome.converted,
      supersededUploadId: outcome.supersededUploadId,
      ...cs,
    },
  });
  res.json({
    upload: outcome.activated,
    workRecordsCreated: outcome.created,
    workRecordsConvertedFromManual: outcome.converted,
    supersededUploadId: outcome.supersededUploadId,
  });
});

// POST /api/timesheets/:id/cancel
// The user closed the preview without importing. Only the uploader's own
// pending upload can be cancelled; anything else is left alone.
export const cancelTimesheet = asyncHandler(async (req, res) => {
  const result = await prisma.timesheetUpload.updateMany({
    where: {
      id: req.params.id,
      status: "PROCESSING",
      uploadedById: req.user.id,
    },
    data: { status: "CANCELLED" },
  });

  res.json({ cancelled: result.count === 1 });
});

function formatSnapshot(snapshot) {
  if (!snapshot) return "";

  return [
    snapshot.role,
    snapshot.hours != null ? `${snapshot.hours} h` : null,
    snapshot.status,
  ]
    .filter(Boolean)
    .join(" · ");
}

// Cells starting with = + - @ are prefixed so Excel can't run them as formulas.
function csvCell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// GET /api/timesheets/:id/diff.csv
// The complete review list (changes, missing records, manual conflicts) for a
// pending upload; the JSON preview only carries the first PREVIEW_LIST_LIMIT.
export const downloadDiff = asyncHandler(async (req, res) => {
  const upload = await prisma.timesheetUpload.findUnique({
    where: { id: req.params.id },
  });
  if (!upload) throw ApiError.notFound("Timesheet upload not found");
  if (upload.status !== "PROCESSING") {
    throw ApiError.conflict("Only a pending upload has a review list.");
  }

  const periodMonth = upload.periodMonth.toISOString().slice(0, 7);
  const context = await loadValidationContext(upload.companyId);
  const workbook = readWorkbookOrThrow(await readFile(upload.storageKey));
  const { errors, records } = parseAndValidateWorkbook(workbook, {
    periodDate: upload.periodMonth,
    ...context,
  });
  if (errors.length > 0) {
    throw ApiError.conflict("This upload has validation errors and has no review list.");
  }

  const { overlap, changes } = await analyzeUpload({
    records,
    companyId: upload.companyId,
    periodDate: upload.periodMonth,
    periodMonth,
    context,
    excludeUploadId: upload.id,
  });

  const rows = [
    ["Section", "Worker code", "Worker name", "Date", "Previous / existing", "Uploaded"],
    ...(changes ?? []).map((c) => [
      c.type,
      c.workerCode,
      c.workerName,
      c.workDate,
      formatSnapshot(c.previous),
      formatSnapshot(c.uploaded),
    ]),
    ...overlap.conflicts.map((c) => [
      "MANUAL_CONFLICT",
      c.workerCode,
      c.workerName,
      c.workDate,
      formatSnapshot({ role: c.existingRole, hours: c.existingHours, status: c.existingStatus }),
      formatSnapshot({ role: c.uploadedRole, hours: c.uploadedHours, status: c.uploadedStatus }),
    ]),
  ];

  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="timesheet-review.csv"');
  res.send(`﻿${csv}`);
});

export const listTimesheets = asyncHandler(async (req, res) => {
  const { companyId, status, month, page, pageSize } = listQuerySchema.parse(
    req.query,
  );

  const where = {
    ...(companyId ? { companyId } : {}),
    ...(status ? { status } : {}),
  };

  if (month) {
    const { start, end } = monthRange(month);
    where.periodMonth = { gte: start, lt: end };
  }

  const [uploads, total] = await Promise.all([
    prisma.timesheetUpload.findMany({
      where,
      orderBy: { uploadedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        company: { select: { id: true, code: true, name: true } },
        uploadedBy: { select: { id: true, name: true } },
      },
    }),
    prisma.timesheetUpload.count({ where }),
  ]);

  // supersededById is a plain id, so look up who replaced each timesheet.
  const replacerIds = [
    ...new Set(uploads.map((u) => u.supersededById).filter(Boolean)),
  ];
  const replacers = replacerIds.length
    ? await prisma.timesheetUpload.findMany({
        where: { id: { in: replacerIds } },
        select: {
          id: true,
          uploadedAt: true,
          confirmedAt: true,
          uploadedBy: { select: { name: true } },
        },
      })
    : [];
  const replacerById = Object.fromEntries(replacers.map((r) => [r.id, r]));

  res.json({
    uploads: uploads.map((u) => ({
      ...u,
      supersededBy: u.supersededById
        ? (replacerById[u.supersededById] ?? null)
        : null,
    })),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  });
});

export const getTimesheet = asyncHandler(async (req, res) => {
  const upload = await prisma.timesheetUpload.findUnique({
    where: { id: req.params.id },
    include: {
      company: { select: { id: true, code: true, name: true } },
      uploadedBy: { select: { id: true, name: true } },
    },
  });
  if (!upload) throw ApiError.notFound("Timesheet upload not found");
  res.json({ upload });
});

// GET /api/timesheets/:id/source — "View source timesheet". Requires the
// same auth as everything else (mounted behind requireAuth); the storage
// key is never exposed to the client, only this proxied download.
export const downloadSource = asyncHandler(async (req, res) => {
  const upload = await prisma.timesheetUpload.findUnique({
    where: { id: req.params.id },
  });
  if (!upload) throw ApiError.notFound("Timesheet upload not found");

  const buffer = await readFile(upload.storageKey);
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${encodeURIComponent(upload.originalFilename)}"`,
  );
  res.send(buffer);
});