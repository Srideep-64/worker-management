
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  monthSchema,
  monthRange,
  currentMonthString,
} from "../utils/dates.js";

/* Validation schemas                                                         */

export const monthQuerySchema = z.object({
  month: monthSchema.optional(),
});

export const createManualWorkSchema = z.object({
  roleId: z.string().uuid(),
  workDate: z.coerce.date(),
  status: z.enum([
    "WORKED",
    "ABSENT",
    "HOLIDAY",
    "WEEKLY_OFF",
  ]),
  hours: z.coerce.number().gt(0).max(24).optional(),
});

export const updateManualWorkSchema = z.object({
  status: z.enum([
    "WORKED",
    "ABSENT",
    "HOLIDAY",
    "WEEKLY_OFF",
  ]),
  roleId: z.string().uuid().optional(),
  hours: z.coerce.number().gt(0).max(24).optional(),
});

/* Shared helpers                                                             */

const RECORD_INCLUDE = {
  role: {
    select: {
      id: true,
      code: true,
      name: true,
    },
  },
  upload: {
    select: {
      id: true,
      originalFilename: true,
      status: true,
    },
  },
};

// Use UAE calendar dates consistently, regardless of server timezone.
function getUaeDateParts() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );

  return {
    year: values.year,
    month: values.month,
    day: values.day,
  };
}

function dateOnly(value) {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString().slice(0, 10);
}

function getUaeCalendarDates() {
  const { year, month, day } = getUaeDateParts();

  return {
    today: `${year}-${month}-${day}`,
    monthStart: `${year}-${month}-01`,
  };
}

// A worker remains active through their leaving month.
// They become inactive on the first day of the following month.
function isWorkerActive(worker) {
  const { today, monthStart } = getUaeCalendarDates();

  const joiningDate = dateOnly(worker.joiningDate);
  const leavingDate = dateOnly(worker.leavingDate);

  const hasJoined = joiningDate !== null && joiningDate <= today;
  const hasNotLeft = !leavingDate || leavingDate >= monthStart;

  return hasJoined && hasNotLeft;
}

function assertWorkerActive(worker) {
  if (!isWorkerActive(worker)) {
    throw ApiError.badRequest(
      "This worker is inactive for the current date. New attendance entries and edits are not allowed.",
    );
  }
}

function validateWorkStatus({ status, hours }) {
  if (status === "WORKED" && hours == null) {
    throw ApiError.badRequest(
      "Hours are required when status is WORKED",
    );
  }

  if (status !== "WORKED" && hours != null) {
    throw ApiError.badRequest(
      "Hours must be omitted for non-WORKED statuses",
    );
  }
}

function getMonthStart(workDate) {
  return new Date(
    Date.UTC(
      workDate.getUTCFullYear(),
      workDate.getUTCMonth(),
      1,
    ),
  );
}

async function assertNoActiveTimesheet(companyId, workDate, action) {
  const monthStart = getMonthStart(workDate);

  const activeTimesheet = await prisma.timesheetUpload.findFirst({
    where: {
      companyId,
      periodMonth: monthStart,
      status: "ACTIVE",
    },
    select: {
      id: true,
      originalFilename: true,
    },
  });

  if (activeTimesheet) {
    throw ApiError.conflict(
      `This month is managed by an active timesheet. Manual records cannot be ${action}.`,
    );
  }
}

function serializeRecord(record) {
  return {
    id: record.id,
    date: record.workDate.toISOString().slice(0, 10),
    status: record.status,
    hours: record.hours == null ? null : Number(record.hours),
    source: record.source,
    role: record.role,
    upload: record.upload,
  };
}

/* Attendance summary                                                         */

function summarize(records) {
  const summary = {
    totalHours: 0,
    workedDays: 0,
    absentDays: 0,
    holidays: 0,
    weeklyOffs: 0,
    byRole: {},
  };

  for (const record of records) {
    if (record.status === "WORKED") {
      const hours = record.hours ?? 0;

      summary.workedDays += 1;
      summary.totalHours += hours;

      const role = `${record.role.code} — ${record.role.name}`;

      summary.byRole[role] =
        (summary.byRole[role] || 0) + hours;
    } else if (record.status === "ABSENT") {
      summary.absentDays += 1;
    } else if (record.status === "HOLIDAY") {
      summary.holidays += 1;
    } else if (record.status === "WEEKLY_OFF") {
      summary.weeklyOffs += 1;
    }
  }

  const list = (items) =>
    Object.entries(items)
      .map(([name, hours]) => ({ name, hours }))
      .sort((a, b) => b.hours - a.hours);

  return {
    ...summary,
    byRole: list(summary.byRole),
  };
}

/* GET /api/workers/:id/work?month=YYYY-MM                                    */

export const getWorkerWork = asyncHandler(async (req, res) => {
  const worker = await prisma.worker.findUnique({
    where: {
      id: req.params.id,
    },
    select: {
      id: true,
    },
  });

  if (!worker) {
    throw ApiError.notFound("Worker not found");
  }

  const month = req.query.month || currentMonthString();
  const { start, end } = monthRange(month);

  const rows = await prisma.workRecord.findMany({
    where: {
      workerId: worker.id,
      workDate: {
        gte: start,
        lt: end,
      },
    },
    orderBy: {
      workDate: "asc",
    },
    include: RECORD_INCLUDE,
  });

  const records = rows.map(serializeRecord);

  res.json({
    month,
    records,
    summary: summarize(records),
  });
});

/* POST /api/workers/:id/work                                                 */
export const createManualWork = asyncHandler(async (req, res) => {
  const workerId = req.params.id;

  const {
    roleId,
    workDate,
    status,
    hours,
  } = req.body;

  const worker = await prisma.worker.findUnique({
    where: {
      id: workerId,
    },
    select: {
      id: true,
      companyId: true,
      joiningDate: true,
      leavingDate: true,
    },
  });

  if (!worker) {
    throw ApiError.notFound("Worker not found");
  }

  // Status is calculated from joiningDate and leavingDate,
  // not from a manually stored isActive flag.
  assertWorkerActive(worker);

  validateWorkStatus({ status, hours });

  // Preserve the invariant that a month uses either an active
  // company timesheet or manual records, not both.
  await assertNoActiveTimesheet(
    worker.companyId,
    workDate,
    "added",
  );

  const role = await prisma.role.findUnique({
    where: {
      id: roleId,
    },
    select: {
      id: true,
    },
  });

  if (!role) {
    throw ApiError.badRequest(
      "roleId does not reference an existing role",
    );
  }

  const existing = await prisma.workRecord.findUnique({
    where: {
      workerId_workDate: {
        workerId,
        workDate,
      },
    },
    select: {
      id: true,
    },
  });

  if (existing) {
    throw ApiError.conflict(
      "A work record already exists for this worker on this date",
    );
  }

  const record = await prisma.workRecord.create({
    data: {
      workerId,
      roleId,
      workDate,
      status,
      hours: status === "WORKED" ? hours : null,
      source: "MANUAL",
      uploadId: null,
    },
    include: RECORD_INCLUDE,
  });

  res.status(201).json({
    record: serializeRecord(record),
  });
});

/* PATCH /api/workers/:id/work/:recordId                                      */
export const updateManualWork = asyncHandler(async (req, res) => {
  const { id: workerId, recordId } = req.params;
  const { status, roleId, hours } = req.body;

  const existing = await prisma.workRecord.findFirst({
    where: {
      id: recordId,
      workerId,
    },
    include: RECORD_INCLUDE,
  });

  if (!existing) {
    throw ApiError.notFound("Work record not found");
  }

  // Timesheet records must never be edited manually.
  if (existing.source !== "MANUAL" || existing.uploadId) {
    throw ApiError.badRequest(
      "Timesheet records cannot be edited. Update the source timesheet instead.",
    );
  }

  const worker = await prisma.worker.findUnique({
    where: {
      id: workerId,
    },
    select: {
      id: true,
      companyId: true,
      joiningDate: true,
      leavingDate: true,
    },
  });

  if (!worker) {
    throw ApiError.notFound("Worker not found");
  }

  assertWorkerActive(worker);

  validateWorkStatus({ status, hours });

  await assertNoActiveTimesheet(
    worker.companyId,
    existing.workDate,
    "edited",
  );

  // Preserve the stored role for non-WORKED statuses.
  const nextRoleId =
    status === "WORKED"
      ? roleId ?? existing.roleId
      : existing.roleId;

  if (status === "WORKED" && !nextRoleId) {
    throw ApiError.badRequest(
      "Select a role when status is WORKED",
    );
  }

  const role = await prisma.role.findUnique({
    where: {
      id: nextRoleId,
    },
    select: {
      id: true,
    },
  });

  if (!role) {
    throw ApiError.badRequest(
      "The selected role does not exist",
    );
  }

  const updated = await prisma.workRecord.update({
    where: {
      id: existing.id,
    },
    data: {
      status,
      roleId: nextRoleId,
      hours: status === "WORKED" ? hours : null,
    },
    include: RECORD_INCLUDE,
  });

  res.json({
    record: serializeRecord(updated),
  });
});

/* GET /api/companies/:id/stats?month=YYYY-MM                                 */
export const getCompanyStats = asyncHandler(async (req, res) => {
  const company = await prisma.company.findUnique({
    where: {
      id: req.params.id,
    },
    select: {
      id: true,
    },
  });

  if (!company) {
    throw ApiError.notFound("Company not found");
  }

  const month = req.query.month || currentMonthString();
  const { start, end } = monthRange(month);

  const workers = await prisma.worker.findMany({
    where: {
      companyId: company.id,
    },
    select: {
      id: true,
    },
  });

  const workerIds = workers.map((worker) => worker.id);

  const [rows, activeUpload, payrollRates, advances] =
    await Promise.all([
      prisma.workRecord.findMany({
        where: {
          workerId: {
            in: workerIds,
          },
          workDate: {
            gte: start,
            lt: end,
          },
        },
        select: {
          workerId: true,
          status: true,
          hours: true,
          role: {
            select: {
              code: true,
              name: true,
            },
          },
        },
      }),

      prisma.timesheetUpload.findFirst({
        where: {
          companyId: company.id,
          periodMonth: start,
          status: "ACTIVE",
        },
        select: {
          id: true,
          originalFilename: true,
          uploadedAt: true,
        },
      }),

      prisma.workerPayroll.findMany({
        where: {
          workerId: {
            in: workerIds,
          },
          payrollMonth: start,
        },
        select: {
          workerId: true,
          hourlyRate: true,
        },
      }),

      prisma.advancePayment.findMany({
        where: {
          workerId: {
            in: workerIds,
          },
          payrollMonth: start,
        },
        select: {
          workerId: true,
          amount: true,
        },
      }),
    ]);

  // Keep the attendance summary independent of current worker status.
  // This preserves historical reporting.
  const records = rows.map((record) => ({
    ...record,
    hours: record.hours == null ? null : Number(record.hours),
  }));

  const summary = summarize(records);

  const attendanceByWorker = new Map();

  for (const record of records) {
    if (!attendanceByWorker.has(record.workerId)) {
      attendanceByWorker.set(record.workerId, {
        totalHours: 0,
        absentDays: 0,
      });
    }

    const attendance = attendanceByWorker.get(record.workerId);

    if (record.status === "WORKED") {
      attendance.totalHours += record.hours ?? 0;
    } else if (record.status === "ABSENT") {
      attendance.absentDays += 1;
    }
  }

  const rateByWorker = new Map(
    payrollRates.map((payroll) => [
      payroll.workerId,
      Number(payroll.hourlyRate),
    ]),
  );

  const advancesByWorker = new Map();

  for (const advance of advances) {
    advancesByWorker.set(
      advance.workerId,
      (advancesByWorker.get(advance.workerId) ?? 0) +
        Number(advance.amount),
    );
  }

  let workersWithRate = 0;
  let workersWithoutRate = 0;
  let grossPay = 0;
  let absenceDeductions = 0;
  let netPay = 0;
  let totalAdvances = 0;

  for (const worker of workers) {
    const hourlyRate = rateByWorker.get(worker.id);

    if (hourlyRate === undefined) {
      workersWithoutRate += 1;
      continue;
    }

    workersWithRate += 1;

    const attendance = attendanceByWorker.get(worker.id) ?? {
      totalHours: 0,
      absentDays: 0,
    };

    const workerGrossPay =
      attendance.totalHours * hourlyRate;

    const workerAbsenceDeduction =
      Math.max(0, attendance.absentDays - 2) * 25;

    const workerNetPay =
      workerGrossPay - workerAbsenceDeduction;

    const workerAdvances =
      advancesByWorker.get(worker.id) ?? 0;

    grossPay += workerGrossPay;
    absenceDeductions += workerAbsenceDeduction;
    netPay += workerNetPay;
    totalAdvances += workerAdvances;
  }

  const money = (value) =>
    Math.round((value + Number.EPSILON) * 100) / 100;

  const payrollSummary = {
    workersWithRate,
    workersWithoutRate,
    grossPay: money(grossPay),
    absenceDeductions: money(absenceDeductions),
    netPay: money(netPay),
    totalAdvances: money(totalAdvances),
    remainingPay: money(netPay - totalAdvances),
  };

  res.json({
    month,
    activeUpload,
    workersWithRecords: new Set(
      rows.map((record) => record.workerId),
    ).size,
    summary,
    payrollSummary,
  });
});
