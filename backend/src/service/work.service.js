import { prisma } from "../lib/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { calculatePayroll, money } from "../utils/payroll.js";
import { 
  monthRange,
  monthStartDate,
  currentMonthString,
  dateOnly,
  dateKeyToUtcDate,
  getMonthStart,
  getUaeCalendarDates,} from "../utils/dates.js";
import {
  RECORD_INCLUDE,
  assertWorkDateNotInFuture,
  assertWorkDateWithinEmployment,
  validateWorkStatus,
  assertNoActiveTimesheet,
  serializeRecord,
  summarize,
} from "../utils/workRecord.js";


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

static async createManualWorkBatch(workerId, submittedRecords) {
  if (!submittedRecords.length) {
    throw ApiError.badRequest("At least one record is required.");
  }

  // 1. Normalize dates and reject duplicate dates.
  const normalizedRecords = submittedRecords.map((item) => {
    const key = dateOnly(item.workDate);

    if (!key) {
      throw ApiError.badRequest(
        "Every record must have a valid work date."
      );
    }

    return {
      ...item,
      dateKey: key,
      workDate: dateKeyToUtcDate(key),
    };
  });

  const seenDates = new Set();

  for (const item of normalizedRecords) {
    if (seenDates.has(item.dateKey)) {
      throw ApiError.badRequest(
        `The batch contains more than one entry for ${item.dateKey}.`
      );
    }

    seenDates.add(item.dateKey);
  }

  const month = normalizedRecords[0].dateKey.slice(0, 7);

  if (
    normalizedRecords.some(
      (item) => item.dateKey.slice(0, 7) !== month
    )
  ) {
    throw ApiError.badRequest(
      "All records in a batch must belong to the same month."
    );
  }

  const monthStart = monthStartDate(month);
  const workDates = normalizedRecords.map((item) => item.workDate);

  const savedRecords = await prisma.$transaction(
    async (tx) => {
      // 2. Validate worker and active timesheet.
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
      
      await assertNoActiveTimesheet(
        worker.companyId,
        monthStart,
        "uploaded",
        tx,
      );

      // 3. Fetch existing records without loading unnecessary relations.
      const existingRecords = await tx.workRecord.findMany({
        where: {
          workerId,
          workDate: { in: workDates },
        },
        select: {
          id: true,
          workDate: true,
          roleId: true,
          source: true,
          uploadId: true,
        },
      });

      const existingByDate = new Map(
        existingRecords.map((record) => [
          dateOnly(record.workDate),
          record,
        ])
      );

      // 4. Validate all submitted records before writing anything.
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
        assertWorkDateNotInFuture(workDate);
        validateWorkStatus({ status, hours });

        const existing = existingByDate.get(dateKey);

        if (recordId) {
          if (!existing || existing.id !== recordId) {
            throw ApiError.conflict(
              `The existing record for ${dateKey} has changed. Refresh attendance and try again.`
            );
          }

          if (existing.source !== "MANUAL" || existing.uploadId) {
            throw ApiError.badRequest(
              `The timesheet record for ${dateKey} cannot be edited manually.`
            );
          }
        } else if (existing) {
          throw ApiError.conflict(
            `A record already exists for ${dateKey}. Refresh attendance before uploading.`
          );
        }

        const nextRoleId = roleId ?? existing?.roleId;

        if (!nextRoleId) {
          throw ApiError.badRequest(
            `Select a role for the new record dated ${dateKey}.`
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

      // 5. Validate all roles in one query.
      const roleIds = [
        ...new Set(plans.map((item) => item.roleId)),
      ];

      const roles = await tx.role.findMany({
        where: { id: { in: roleIds } },
        select: { id: true },
      });

      const validRoleIds = new Set(
        roles.map((role) => role.id)
      );

      for (const item of plans) {
        if (!validRoleIds.has(item.roleId)) {
          throw ApiError.badRequest(
            "One or more selected roles do not exist."
          );
        }
      }

      // 6. Separate inserts from updates.
      const newRecords = plans.filter(
        (item) => !item.existing
      );

      const existingPlans = plans.filter(
        (item) => item.existing
      );

      // 7. Bulk-insert all new manual records in one query.
      if (newRecords.length > 0) {
        await tx.workRecord.createMany({
          data: newRecords.map((item) => ({
            workerId,
            workDate: item.workDate,
            roleId: item.roleId,
            status: item.status,
            hours: item.hours,
            source: "MANUAL",
            uploadId: null,
          })),
        });
      }

      // 8. Update existing manual records.
      // Keep these updates inside the same transaction.
      for (const item of existingPlans) {
        await tx.workRecord.update({
          where: { id: item.existing.id },
          data: {
            roleId: item.roleId,
            status: item.status,
            hours: item.hours,
          },
        });
      }

      // 9. Fetch all saved records and their relations once.
      const records = await tx.workRecord.findMany({
        where: {
          workerId,
          workDate: { in: workDates },
        },
        include: RECORD_INCLUDE,
      });

      // 10. Preserve the order of submitted records.
      const recordsByDate = new Map(
        records.map((record) => [
          dateOnly(record.workDate),
          record,
        ])
      );

      return plans.map((item) => {
        const record = recordsByDate.get(
          dateOnly(item.workDate)
        );

        if (!record) {
          throw new Error(
            `Saved work record not found for ${dateOnly(item.workDate)}.`
          );
        }

        return serializeRecord(record);
      });
    },
    {
      maxWait: 10000,
      timeout: 20000,
    }
  );

  return {
    month,
    count: savedRecords.length,
    records: savedRecords,
  };
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