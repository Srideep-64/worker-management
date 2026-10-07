import * as XLSX from "xlsx";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { saveFile, readFile } from "../lib/storage.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { parseAndValidateWorkbook } from "../utils/timesheetParser.js";

export const uploadBodySchema = z.object({
  companyId: z.string().uuid(),
  periodMonth: z.string().regex(/^\d{4}-\d{2}$/, "periodMonth must be YYYY-MM"),
});

export const confirmBodySchema = z.object({
  replace: z.coerce.boolean().optional().default(false),
});

export const listQuerySchema = z.object({
  companyId: z.string().uuid().optional(),
  status: z.enum(["PROCESSING", "ACTIVE", "SUPERSEDED", "FAILED"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});

function periodMonthToDate(str) {
  const [y, m] = str.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1));
}

// Loads everything the parser needs to resolve business identifiers
// (worker_code, client code, role code) to database IDs, scoped so a
// worker from a different company can never silently match by code.
async function loadValidationContext(companyId) {
  const [workers, clients, roles] = await Promise.all([
    prisma.worker.findMany({
      where: { companyId },
      select: {
        id: true,
        workerCode: true,
        name: true,
      },
    }),

    prisma.client.findMany({
      select: {
        id: true,
        code: true,
        name: true,
      },
    }),

    prisma.role.findMany({
      select: {
        id: true,
        code: true,
        name: true,
      },
    }),
  ]);

  return {
    workersByCode: Object.fromEntries(
      workers.map((worker) => [worker.workerCode, worker])
    ),

    clientsByCode: Object.fromEntries(
      clients.map((client) => [client.code, client])
    ),

    rolesByCode: Object.fromEntries(
      roles.map((role) => [role.code, role])
    ),
  };
}

function buildPreview(records, context) {
  const workersById = Object.fromEntries(
    Object.values(context.workersByCode).map((worker) => [
      worker.id,
      worker,
    ])
  );

  const clientsById = Object.fromEntries(
    Object.values(context.clientsByCode).map((client) => [
      client.id,
      client,
    ])
  );

  const rolesById = Object.fromEntries(
    Object.values(context.rolesByCode).map((role) => [
      role.id,
      role,
    ])
  );

  return records.slice(0, 10).map((record) => {
    const worker = workersById[record.workerId];
    const client = clientsById[record.clientId];
    const role = rolesById[record.roleId];

    return {
      workerId: worker?.workerCode ?? record.workerId,
      workerName: worker?.name ?? "Unknown worker",

      clientId: client?.code ?? record.clientId,
      clientName: client?.name ?? "Unknown client",

      role: role?.code ?? record.roleId,
      roleName: role?.name ?? "Unknown role",

      workDate: record.workDate,
      hours: record.hours,
      status: record.status,
    };
  });
}

function readWorkbookOrThrow(buffer) {
  try {
    return XLSX.read(buffer, { type: "buffer", cellDates: true });
  } catch {
    throw ApiError.badRequest("Could not read this file as an Excel workbook");
  }
}

// POST /api/timesheets/upload
// Parses, validates and stores the file, but never writes a single
// work_record here — that only happens in confirmTimesheet, after the
// caller has seen the preview/errors and explicitly confirmed.
export const uploadTimesheet = asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest("An .xlsx/.xls file is required (field name 'file')");
  const { companyId, periodMonth } = req.body;

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) throw ApiError.badRequest("companyId does not reference an existing company");

  const periodDate = periodMonthToDate(periodMonth);
  const context = await loadValidationContext(companyId);
  const workbook = readWorkbookOrThrow(req.file.buffer);
  const { format, errors, records } = parseAndValidateWorkbook(workbook, { periodDate, ...context });

  // The file is kept regardless of outcome (including FAILED) so a rejected
  // upload can still be reviewed later — "the original Excel file should
  // remain associated with its upload record" applies even to failures.
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

  const existingActive = await prisma.timesheetUpload.findFirst({
    where: { companyId, periodMonth: periodDate, status: "ACTIVE" },
  });

  res.json({
    upload,
    valid: true,
    format,
    rowCount: records.length,
    requiresConfirmation: true,
    conflict: existingActive
      ? { existingUploadId: existingActive.id, uploadedAt: existingActive.uploadedAt, rowCount: existingActive.rowCount }
      : null,
    preview: buildPreview(records, context),
  });
});

// POST /api/timesheets/:id/confirm
// Re-reads the stored file and re-validates from scratch rather than
// trusting anything cached from the upload step — company data (workers,
// clients) could have changed in between, and this keeps the confirm step
// self-contained instead of needing a second place to store parsed rows.
export const confirmTimesheet = asyncHandler(async (req, res) => {
  const { replace } = req.body;
  const upload = await prisma.timesheetUpload.findUnique({ where: { id: req.params.id } });
  if (!upload) throw ApiError.notFound("Timesheet upload not found");
  if (upload.status !== "PROCESSING") {
    throw ApiError.conflict(`This upload is already ${upload.status.toLowerCase()} and cannot be confirmed again`);
  }

  const context = await loadValidationContext(upload.companyId);
  const fileBuffer = await readFile(upload.storageKey);
  const workbook = readWorkbookOrThrow(fileBuffer);
  const { errors, records } = parseAndValidateWorkbook(workbook, { periodDate: upload.periodMonth, ...context });

  if (errors.length > 0) {
    await prisma.timesheetUpload.update({
      where: { id: upload.id },
      data: { status: "FAILED", errorCount: errors.length },
    });
    return res.status(422).json({ valid: false, errors });
  }

  const existingActive = await prisma.timesheetUpload.findFirst({
    where: { companyId: upload.companyId, periodMonth: upload.periodMonth, status: "ACTIVE", NOT: { id: upload.id } },
  });

  if (existingActive && !replace) {
    throw ApiError.conflict("An ACTIVE timesheet already exists for this company and month. Resend with replace=true to supersede it.", {
      existingUploadId: existingActive.id,
    });
  }

  // Single transaction: superseding the old upload's records and inserting
  // the new ones happen together, so a crash midway never leaves the month
  // with both, or neither, set of work records.
const result = await prisma.$transaction(async (tx) => {
  // 1. Remove records belonging to an older ACTIVE timesheet.
  if (existingActive) {
    await tx.workRecord.deleteMany({
      where: {
        uploadId: existingActive.id,
      },
    });

    await tx.timesheetUpload.update({
      where: {
        id: existingActive.id,
      },
      data: {
        status: "SUPERSEDED",
      },
    });
  }

  // 2. Remove MANUAL records for this company/month.
  //
  // The uploaded timesheet becomes the source of truth for the month,
  // so existing manual records must not conflict with its worker/date
  // records.
  const monthStart = upload.periodMonth;

  const monthEnd = new Date(
    Date.UTC(
      monthStart.getUTCFullYear(),
      monthStart.getUTCMonth() + 1,
      1
    )
  );

  await tx.workRecord.deleteMany({
    where: {
      worker: {
        companyId: upload.companyId,
      },
      workDate: {
        gte: monthStart,
        lt: monthEnd,
      },
      source: "MANUAL",
    },
  });

  // 3. Insert the new timesheet records.
  if (records.length > 0) {
    await tx.workRecord.createMany({
      data: records.map((r) => ({
        ...r,
        uploadId: upload.id,
        source: "TIMESHEET",
      })),
    });
  }

  // 4. Make this upload ACTIVE.
  return tx.timesheetUpload.update({
    where: {
      id: upload.id,
    },
    data: {
      status: "ACTIVE",
      rowCount: records.length,
      errorCount: 0,
    },
  });
});

  res.json({ upload: result, workRecordsCreated: records.length });
});

export const listTimesheets = asyncHandler(async (req, res) => {
  const { companyId, status, page, pageSize } = req.query;
  const where = { companyId, status };

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

  res.json({ uploads, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
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
  const upload = await prisma.timesheetUpload.findUnique({ where: { id: req.params.id } });
  if (!upload) throw ApiError.notFound("Timesheet upload not found");

  const buffer = await readFile(upload.storageKey);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(upload.originalFilename)}"`);
  res.send(buffer);
});
