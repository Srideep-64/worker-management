
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { calculatePayroll, money } from "../utils/payroll.js";
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

export const createManualWorkBatchSchema = z.object({
  records: z.array(
    z.object({
      recordId: z.string().uuid().optional(),
      workDate: z.coerce.date(),
      roleId: z.string().uuid().optional(),
      status: z.enum([
        "WORKED",
        "ABSENT",
        "HOLIDAY",
        "WEEKLY_OFF",
      ]),
      hours: z.coerce.number().gt(0).max(24).optional(),
    }),
  ).min(1).max(31),
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


function assertWorkDateWithinEmployment(worker, workDate) {
  const joiningDate = dateOnly(worker.joiningDate);
  const leavingDate = dateOnly(worker.leavingDate);
  const requestedWorkDate = dateOnly(workDate);

  if (!requestedWorkDate) {
    throw ApiError.badRequest("Invalid work date.");
  }

  if (joiningDate && requestedWorkDate < joiningDate) {
    throw ApiError.badRequest(
      `Cannot add or edit a work record dated ${requestedWorkDate}. The worker's joining date is ${joiningDate}.`,
    );
  }

  if (leavingDate && requestedWorkDate > leavingDate) {
    throw ApiError.badRequest(
      `Cannot add or edit a work record dated ${requestedWorkDate}. The worker's leaving date is ${leavingDate}.`,
    );
  }
}


function assertWorkDateNotAfterLeavingDate(worker, workDate) {
  const leavingDate = dateOnly(worker.leavingDate);
  const requestedWorkDate = dateOnly(workDate);

  if (leavingDate && requestedWorkDate > leavingDate) {
    throw ApiError.badRequest(
      `Cannot add or edit a work record dated ${requestedWorkDate}. The worker's leaving date is ${leavingDate}.`,
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

  assertWorkDateWithinEmployment(worker, workDate);

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

  assertWorkDateWithinEmployment(worker, existing.workDate);

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

/* POST /api/workers/:id/work/batch */
export const createManualWorkBatch = asyncHandler(async (req, res) => {
  const workerId = req.params.id;
  const { records: submittedRecords } = req.body;

  // Normalize dates to calendar-day keys and reject duplicate dates.
  const normalizedRecords = submittedRecords.map((item) => {
    const key = dateOnly(item.workDate);

    if (!key) {
      throw ApiError.badRequest("Every record must have a valid work date.");
    }

    return {
      ...item,
      dateKey: key,
      workDate: new Date(`${key}T00:00:00.000Z`),
    };
  });

  const seenDates = new Set();

  for (const item of normalizedRecords) {
    if (seenDates.has(item.dateKey)) {
      throw ApiError.badRequest(
        `The batch contains more than one entry for ${item.dateKey}.`,
      );
    }

    seenDates.add(item.dateKey);
  }

  const month = normalizedRecords[0].dateKey.slice(0, 7);

  if (normalizedRecords.some((item) => item.dateKey.slice(0, 7) !== month)) {
    throw ApiError.badRequest(
      "All records in a batch must belong to the same month.",
    );
  }

  const monthStart = new Date(`${month}-01T00:00:00.000Z`);

  const savedRecords = await prisma.$transaction(async (tx) => {
    const worker = await tx.worker.findUnique({
      where: { id: workerId },
      select: {
        id: true,
        companyId: true,
        joiningDate: true,
        leavingDate: true,
      },
    });

    if (!worker) {
      throw ApiError.notFound("Worker not found.");
    }

    // One check for the entire month, rather than one per entry.
    const activeTimesheet = await tx.timesheetUpload.findFirst({
      where: {
        companyId: worker.companyId,
        periodMonth: monthStart,
        status: "ACTIVE",
      },
      select: { id: true },
    });

    if (activeTimesheet) {
      throw ApiError.conflict(
        "This month is managed by an active timesheet. Manual records cannot be uploaded.",
      );
    }

    const existingRecords = await tx.workRecord.findMany({
      where: {
        workerId,
        workDate: {
          in: normalizedRecords.map((item) => item.workDate),
        },
      },
      include: RECORD_INCLUDE,
    });

    const existingByDate = new Map(
      existingRecords.map((record) => [
        dateOnly(record.workDate),
        record,
      ]),
    );

    // Validate every item and prepare its final values before writing.
    const plans = normalizedRecords.map((item) => {
      const {
        dateKey,
        workDate,
        recordId,
        roleId,
        status,
        hours,
      } = item;

      assertWorkDateWithinEmployment(worker, workDate);
      validateWorkStatus({ status, hours });

      const existing = existingByDate.get(dateKey);

      if (recordId) {
        if (!existing || existing.id !== recordId) {
          throw ApiError.conflict(
            `The existing record for ${dateKey} has changed. Refresh attendance and try again.`,
          );
        }

        if (existing.source !== "MANUAL" || existing.uploadId) {
          throw ApiError.badRequest(
            `The timesheet record for ${dateKey} cannot be edited manually.`,
          );
        }
      } else if (existing) {
        throw ApiError.conflict(
          `A record already exists for ${dateKey}. Refresh attendance before uploading.`,
        );
      }

      const nextRoleId = roleId ?? existing?.roleId;

      if (!nextRoleId) {
        throw ApiError.badRequest(
          `Select a role for the new record dated ${dateKey}.`,
        );
      }

      return {
        existing,
        workDate,
        roleId: nextRoleId,
        status,
        hours: status === "WORKED" ? hours : null,
      };
    });

    // Check all role IDs with one query.
    const roleIds = [...new Set(plans.map((item) => item.roleId))];

    const roles = await tx.role.findMany({
      where: { id: { in: roleIds } },
      select: { id: true },
    });

    const validRoleIds = new Set(roles.map((role) => role.id));

    for (const item of plans) {
      if (!validRoleIds.has(item.roleId)) {
        throw ApiError.badRequest(
          "One or more selected roles do not exist.",
        );
      }
    }

    // All validation has passed. Writes commit together or roll back together.
    const results = [];

    for (const item of plans) {
      const data = {
        roleId: item.roleId,
        status: item.status,
        hours: item.hours,
      };

      const record = item.existing
        ? await tx.workRecord.update({
            where: { id: item.existing.id },
            data,
            include: RECORD_INCLUDE,
          })
        : await tx.workRecord.create({
            data: {
              workerId,
              workDate: item.workDate,
              ...data,
              source: "MANUAL",
              uploadId: null,
            },
            include: RECORD_INCLUDE,
          });

      results.push(serializeRecord(record));
    }

    return results;
  },{
  maxWait:10000,
  timeout:20000,
});

  res.status(200).json({
    month,
    count: savedRecords.length,
    records: savedRecords,
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

    const attendance = attendanceByWorker.get(worker.id) ?? {
      totalHours: 0,
      absentDays: 0,
    };

    const workerAdvances =
      advancesByWorker.get(worker.id) ?? 0;

    // Advances count even when the worker has no hourly rate.
    totalAdvances += workerAdvances;

    if (hourlyRate === undefined) {
      workersWithoutRate += 1;
      continue;
    }

    workersWithRate += 1;

    const payroll = calculatePayroll({
      totalHours: attendance.totalHours,
      absentDays: attendance.absentDays,
      hourlyRate,
      totalAdvances: workerAdvances,
    });

    grossPay += payroll.grossPay;
    absenceDeductions += payroll.absenceDeduction;
    netPay += payroll.netPay;
  }

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
