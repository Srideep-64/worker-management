import { prisma } from "../lib/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { calculatePayroll, money } from "../utils/payroll.js";
import { monthRange, currentMonthString } from "../utils/dates.js";

/* Shared helpers */
const RECORD_INCLUDE = {
  role: { select: { id: true, code: true, name: true } },
  upload: { select: { id: true, originalFilename: true, status: true } },
};

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

  return { year: values.year, month: values.month, day: values.day };
}

function dateOnly(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function getUaeCalendarDates() {
  const { year, month, day } = getUaeDateParts();
  return { today: `${year}-${month}-${day}`, monthStart: `${year}-${month}-01` };
}

function assertWorkDateNotInFuture(workDate) {
  const requestedWorkDate = dateOnly(workDate);
  const { today } = getUaeCalendarDates();

  if (!requestedWorkDate) throw ApiError.badRequest("Invalid work date.");
  if (requestedWorkDate > today) {
    throw ApiError.badRequest(
      `Cannot add or edit attendance for a future date (${requestedWorkDate}). Today is ${today} in UAE time.`,
    );
  }
}

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

  if (!requestedWorkDate) throw ApiError.badRequest("Invalid work date.");
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

function validateWorkStatus({ status, hours }) {
  if (status === "WORKED" && hours == null) {
    throw ApiError.badRequest("Hours are required when status is WORKED");
  }
  if (status !== "WORKED" && hours != null) {
    throw ApiError.badRequest("Hours must be omitted for non-WORKED statuses");
  }
}

function getMonthStart(workDate) {
  return new Date(Date.UTC(workDate.getUTCFullYear(), workDate.getUTCMonth(), 1));
}

async function assertNoActiveTimesheet(companyId, workDate, action) {
  const monthStart = getMonthStart(workDate);
  const activeTimesheet = await prisma.timesheetUpload.findFirst({
    where: { companyId, periodMonth: monthStart, status: "ACTIVE" },
    select: { id: true, originalFilename: true },
  });

  if (activeTimesheet) {
    throw ApiError.conflict(`This month is managed by an active timesheet. Manual records cannot be ${action}.`);
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

function summarize(records) {
  const summary = {
    totalHours: 0, workedDays: 0, absentDays: 0,
    holidays: 0, weeklyOffs: 0, byRole: {},
  };

  for (const record of records) {
    if (record.status === "WORKED") {
      const hours = record.hours ?? 0;
      summary.workedDays += 1;
      summary.totalHours += hours;
      const role = `${record.role.code} — ${record.role.name}`;
      summary.byRole[role] = (summary.byRole[role] || 0) + hours;
    } else if (record.status === "ABSENT") {
      summary.absentDays += 1;
    } else if (record.status === "HOLIDAY") {
      summary.holidays += 1;
    } else if (record.status === "WEEKLY_OFF") {
      summary.weeklyOffs += 1;
    }
  }

  const list = (items) => Object.entries(items)
    .map(([name, hours]) => ({ name, hours }))
    .sort((a, b) => b.hours - a.hours);

  return { ...summary, byRole: list(summary.byRole) };
}

/* Service Class */
export class WorkService {
  static async getWorkerWork(workerId, month = currentMonthString()) {
    const worker = await prisma.worker.findUnique({
      where: { id: workerId }, select: { id: true },
    });

    if (!worker) throw ApiError.notFound("Worker not found");

    const { start, end } = monthRange(month);

    const rows = await prisma.workRecord.findMany({
      where: { workerId, workDate: { gte: start, lt: end } },
      orderBy: { workDate: "asc" },
      include: RECORD_INCLUDE,
    });

    const records = rows.map(serializeRecord);
    return { month, records, summary: summarize(records) };
  }

  static async createManualWork(workerId, data) {
    const { roleId, workDate, status, hours } = data;

    const worker = await prisma.worker.findUnique({
      where: { id: workerId },
      select: { id: true, companyId: true, joiningDate: true, leavingDate: true },
    });

    if (!worker) throw ApiError.notFound("Worker not found");

    assertWorkDateWithinEmployment(worker, workDate);
    assertWorkDateNotInFuture(workDate);
    validateWorkStatus({ status, hours });

    await assertNoActiveTimesheet(worker.companyId, workDate, "added");

    const role = await prisma.role.findUnique({
      where: { id: roleId }, select: { id: true },
    });

    if (!role) throw ApiError.badRequest("roleId does not reference an existing role");

    const existing = await prisma.workRecord.findUnique({
      where: { workerId_workDate: { workerId, workDate } },
      select: { id: true },
    });

    if (existing) throw ApiError.conflict("A work record already exists for this worker on this date");

    const record = await prisma.workRecord.create({
      data: {
        workerId, roleId, workDate, status,
        hours: status === "WORKED" ? hours : null,
        source: "MANUAL", uploadId: null,
      },
      include: RECORD_INCLUDE,
    });

    return serializeRecord(record);
  }

  static async updateManualWork(workerId, recordId, data) {
    const { status, roleId, hours } = data;

    const existing = await prisma.workRecord.findFirst({
      where: { id: recordId, workerId },
      include: RECORD_INCLUDE,
    });

    if (!existing) throw ApiError.notFound("Work record not found");

    if (existing.source !== "MANUAL" || existing.uploadId) {
      throw ApiError.badRequest("Timesheet records cannot be edited. Update the source timesheet instead.");
    }

    const worker = await prisma.worker.findUnique({
      where: { id: workerId },
      select: { id: true, companyId: true, joiningDate: true, leavingDate: true },
    });

    if (!worker) throw ApiError.notFound("Worker not found");

    assertWorkDateWithinEmployment(worker, existing.workDate);
    assertWorkDateNotInFuture(existing.workDate);
    validateWorkStatus({ status, hours });

    await assertNoActiveTimesheet(worker.companyId, existing.workDate, "edited");

    const nextRoleId = status === "WORKED" ? roleId ?? existing.roleId : existing.roleId;

    if (status === "WORKED" && !nextRoleId) {
      throw ApiError.badRequest("Select a role when status is WORKED");
    }

    const role = await prisma.role.findUnique({
      where: { id: nextRoleId }, select: { id: true },
    });

    if (!role) throw ApiError.badRequest("The selected role does not exist");

    const updated = await prisma.workRecord.update({
      where: { id: existing.id },
      data: { status, roleId: nextRoleId, hours: status === "WORKED" ? hours : null },
      include: RECORD_INCLUDE,
    });

    return serializeRecord(updated);
  }

  static async createManualWorkBatch(workerId, submittedRecords) {
    const normalizedRecords = submittedRecords.map((item) => {
      const key = dateOnly(item.workDate);
      if (!key) throw ApiError.badRequest("Every record must have a valid work date.");
      return { ...item, dateKey: key, workDate: new Date(`${key}T00:00:00.000Z`) };
    });

    const seenDates = new Set();
    for (const item of normalizedRecords) {
      if (seenDates.has(item.dateKey)) {
        throw ApiError.badRequest(`The batch contains more than one entry for ${item.dateKey}.`);
      }
      seenDates.add(item.dateKey);
    }

    const month = normalizedRecords[0].dateKey.slice(0, 7);
    if (normalizedRecords.some((item) => item.dateKey.slice(0, 7) !== month)) {
      throw ApiError.badRequest("All records in a batch must belong to the same month.");
    }

    const monthStart = new Date(`${month}-01T00:00:00.000Z`);

    const savedRecords = await prisma.$transaction(async (tx) => {
      const worker = await tx.worker.findUnique({
        where: { id: workerId },
        select: { id: true, companyId: true, joiningDate: true, leavingDate: true },
      });

      if (!worker) throw ApiError.notFound("Worker not found.");

      const activeTimesheet = await tx.timesheetUpload.findFirst({
        where: { companyId: worker.companyId, periodMonth: monthStart, status: "ACTIVE" },
        select: { id: true },
      });

      if (activeTimesheet) {
        throw ApiError.conflict("This month is managed by an active timesheet. Manual records cannot be uploaded.");
      }

      const existingRecords = await tx.workRecord.findMany({
        where: { workerId, workDate: { in: normalizedRecords.map((item) => item.workDate) } },
        include: RECORD_INCLUDE,
      });

      const existingByDate = new Map(
        existingRecords.map((record) => [dateOnly(record.workDate), record]),
      );

      const plans = normalizedRecords.map((item) => {
        const { dateKey, workDate, recordId, roleId, status, hours } = item;

        assertWorkDateWithinEmployment(worker, workDate);
        assertWorkDateNotInFuture(workDate);
        validateWorkStatus({ status, hours });

        const existing = existingByDate.get(dateKey);

        if (recordId) {
          if (!existing || existing.id !== recordId) {
            throw ApiError.conflict(`The existing record for ${dateKey} has changed. Refresh attendance and try again.`);
          }
          if (existing.source !== "MANUAL" || existing.uploadId) {
            throw ApiError.badRequest(`The timesheet record for ${dateKey} cannot be edited manually.`);
          }
        } else if (existing) {
          throw ApiError.conflict(`A record already exists for ${dateKey}. Refresh attendance before uploading.`);
        }

        const nextRoleId = roleId ?? existing?.roleId;
        if (!nextRoleId) throw ApiError.badRequest(`Select a role for the new record dated ${dateKey}.`);

        return {
          existing, workDate, roleId: nextRoleId, status,
          hours: status === "WORKED" ? hours : null,
        };
      });

      const roleIds = [...new Set(plans.map((item) => item.roleId))];
      const roles = await tx.role.findMany({
        where: { id: { in: roleIds } }, select: { id: true },
      });

      const validRoleIds = new Set(roles.map((role) => role.id));
      for (const item of plans) {
        if (!validRoleIds.has(item.roleId)) {
          throw ApiError.badRequest("One or more selected roles do not exist.");
        }
      }

      const results = [];
      for (const item of plans) {
        const data = { roleId: item.roleId, status: item.status, hours: item.hours };
        const record = item.existing
          ? await tx.workRecord.update({
              where: { id: item.existing.id },
              data,
              include: RECORD_INCLUDE,
            })
          : await tx.workRecord.create({
              data: { workerId, workDate: item.workDate, ...data, source: "MANUAL", uploadId: null },
              include: RECORD_INCLUDE,
            });

        results.push(serializeRecord(record));
      }

      return results;
    }, { maxWait: 10000, timeout: 20000 });

    return { month, count: savedRecords.length, records: savedRecords };
  }

  static async getCompanyStats(companyId, month = currentMonthString()) {
    const company = await prisma.company.findUnique({
      where: { id: companyId }, select: { id: true },
    });

    if (!company) throw ApiError.notFound("Company not found");

    const { start, end } = monthRange(month);

    const workers = await prisma.worker.findMany({
      where: { companyId: company.id }, select: { id: true },
    });

    const workerIds = workers.map((worker) => worker.id);

    const [rows, activeUpload, payrollRates, advances] = await Promise.all([
      prisma.workRecord.findMany({
        where: { workerId: { in: workerIds }, workDate: { gte: start, lt: end } },
        select: {
          workerId: true, status: true, hours: true,
          role: { select: { code: true, name: true } },
        },
      }),
      prisma.timesheetUpload.findFirst({
        where: { companyId: company.id, periodMonth: start, status: "ACTIVE" },
        select: { id: true, originalFilename: true, uploadedAt: true },
      }),
      prisma.workerPayroll.findMany({
        where: { workerId: { in: workerIds }, payrollMonth: start },
        select: { workerId: true, hourlyRate: true },
      }),
      prisma.advancePayment.findMany({
        where: { workerId: { in: workerIds }, payrollMonth: start },
        select: { workerId: true, amount: true },
      }),
    ]);

    const records = rows.map((record) => ({
      ...record,
      hours: record.hours == null ? null : Number(record.hours),
    }));

    const summary = summarize(records);
    const attendanceByWorker = new Map();

    for (const record of records) {
      if (!attendanceByWorker.has(record.workerId)) {
        attendanceByWorker.set(record.workerId, { totalHours: 0, absentDays: 0 });
      }
      const attendance = attendanceByWorker.get(record.workerId);
      if (record.status === "WORKED") {
        attendance.totalHours += record.hours ?? 0;
      } else if (record.status === "ABSENT") {
        attendance.absentDays += 1;
      }
    }

    const rateByWorker = new Map(
      payrollRates.map((payroll) => [payroll.workerId, Number(payroll.hourlyRate)]),
    );

    const advancesByWorker = new Map();
    for (const advance of advances) {
      advancesByWorker.set(
        advance.workerId,
        (advancesByWorker.get(advance.workerId) ?? 0) + Number(advance.amount),
      );
    }

    let workersWithRate = 0, workersWithoutRate = 0, grossPay = 0, absenceDeductions = 0, netPay = 0, totalAdvances = 0;

    for (const worker of workers) {
      const hourlyRate = rateByWorker.get(worker.id);
      const attendance = attendanceByWorker.get(worker.id) ?? { totalHours: 0, absentDays: 0 };
      const workerAdvances = advancesByWorker.get(worker.id) ?? 0;

      totalAdvances += workerAdvances;

      if (hourlyRate === undefined) {
        workersWithoutRate += 1;
        continue;
      }

      workersWithRate += 1;
      const payroll = calculatePayroll({
        totalHours: attendance.totalHours, absentDays: attendance.absentDays,
        hourlyRate, totalAdvances: workerAdvances,
      });

      grossPay += payroll.grossPay;
      absenceDeductions += payroll.absenceDeduction;
      netPay += payroll.netPay;
    }

    const payrollSummary = {
      workersWithRate, workersWithoutRate,
      grossPay: money(grossPay), absenceDeductions: money(absenceDeductions),
      netPay: money(netPay), totalAdvances: money(totalAdvances),
      remainingPay: money(netPay - totalAdvances),
    };

    return {
      month, activeUpload,
      workersWithRecords: new Set(rows.map((record) => record.workerId)).size,
      summary, payrollSummary,
    };
  }
}