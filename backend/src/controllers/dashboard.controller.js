import { prisma } from "../lib/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { monthSchema, monthRange, currentUaeMonthString } from "../utils/dates.js";
import { getWorkerStatusForMonth } from "../utils/workerStatus.js";
import { calculatePayroll, money } from "../utils/payroll.js";
import { findExpiring } from "./documents.controller.js";

const MIN_RECORDED_WORKERS_FOR_TREND = 9;

function previousMonthString(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function calendarDaysInMonth(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

// The grouping includes workDate so we can count DISTINCT recorded calendar
// dates. Every status counts toward coverage, including ABSENT, HOLIDAY and
// WEEKLY_OFF. Only WORKED contributes hours and ABSENT contributes deductions.
function summarizeAttendance(rows) {
  const hoursByWorker = new Map();
  const absentByWorker = new Map();
  const datesByWorker = new Map();

  for (const row of rows) {
    const id = row.workerId;
    const dateKey = row.workDate.toISOString().slice(0, 10);

    if (!datesByWorker.has(id)) datesByWorker.set(id, new Set());
    datesByWorker.get(id).add(dateKey);

    if (row.status === "WORKED") {
      hoursByWorker.set(
        id,
        (hoursByWorker.get(id) ?? 0) + Number(row._sum.hours ?? 0)
      );
    } else if (row.status === "ABSENT") {
      absentByWorker.set(id, (absentByWorker.get(id) ?? 0) + row._count._all);
    }
  }

  return {
    hoursByWorker,
    absentByWorker,
    datesByWorker,
    workersWithRecords: new Set(datesByWorker.keys()),
  };
}

function hasFullMonthRecords(work, workerId, expectedDays) {
  return work.datesByWorker.get(workerId)?.size === expectedDays;
}

function validRate(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function grossPayForWorker(work, workerId, hourlyRate) {
  return calculatePayroll({
    totalHours: work.hoursByWorker.get(workerId) ?? 0,
    absentDays: work.absentByWorker.get(workerId) ?? 0,
    hourlyRate,
    totalAdvances: 0,
  }).grossPay;
}

export const getDashboard = asyncHandler(async (req, res) => {
  const parsed = monthSchema.safeParse(req.query.month ?? currentUaeMonthString());
  if (!parsed.success) throw ApiError.badRequest("month must be YYYY-MM");

  const month = parsed.data;
  const previousMonth = previousMonthString(month);
  const { start, end } = monthRange(month);
  const { start: previousStart, end: previousEnd } = monthRange(previousMonth);
  const daysCurrent = calendarDaysInMonth(month);
  const daysPrevious = calendarDaysInMonth(previousMonth);
  const currentMonth = currentUaeMonthString(); // Active headcounts reflect today.

  const [
    companies,
    attendance,
    previousAttendance,
    rates,
    previousRates,
    advances,
    expiring,
  ] = await Promise.all([
    prisma.company.findMany({
      orderBy: { code: "asc" },
      select: {
        id: true, code: true, name: true,
        workers: { select: { id: true, joiningDate: true, leavingDate: true } },
      },
    }),
    prisma.workRecord.groupBy({
      by: ["workerId", "workDate", "status"],
      where: { workDate: { gte: start, lt: end } },
      _sum: { hours: true },
      _count: { _all: true },
    }),
    prisma.workRecord.groupBy({
      by: ["workerId", "workDate", "status"],
      where: { workDate: { gte: previousStart, lt: previousEnd } },
      _sum: { hours: true },
      _count: { _all: true },
    }),
    prisma.workerPayroll.findMany({
      where: { payrollMonth: start },
      select: { workerId: true, hourlyRate: true },
    }),
    prisma.workerPayroll.findMany({
      where: { payrollMonth: previousStart },
      select: { workerId: true, hourlyRate: true },
    }),
    prisma.advancePayment.groupBy({
      by: ["workerId"],
      where: { payrollMonth: start },
      _sum: { amount: true },
    }),
    findExpiring({ days: 30, activeOnly: true }),
  ]);

  const selectedWork = summarizeAttendance(attendance);
  const previousWork = summarizeAttendance(previousAttendance);
  const rateByWorker = new Map(rates.map((r) => [
    r.workerId, r.hourlyRate == null ? null : Number(r.hourlyRate),
  ]));
  const previousRateByWorker = new Map(previousRates.map((r) => [
    r.workerId, r.hourlyRate == null ? null : Number(r.hourlyRate),
  ]));
  const advanceByWorker = new Map(advances.map((a) => [
    a.workerId, Number(a._sum.amount ?? 0),
  ]));

  const result = companies.map((company) => {
    let totalHours = 0;
    let grossPay = 0;
    let netPay = 0;
    let totalAdvances = 0;

    let currentRecordedWorkers = 0;
    let previousRecordedWorkers = 0;
    let currentIncludedCount = 0;
    let previousIncludedCount = 0;
    let currentIncludedGross = 0;
    let previousIncludedGross = 0;

    for (const worker of company.workers) {
      const id = worker.id;
      const hours = selectedWork.hoursByWorker.get(id) ?? 0;
      const absences = selectedWork.absentByWorker.get(id) ?? 0;
      const workerAdvances = advanceByWorker.get(id) ?? 0;
      const rate = rateByWorker.get(id);

      // Keep existing dashboard payroll totals independent of the trend filter.
      totalHours += hours;
      totalAdvances += workerAdvances;
      if (rate !== undefined && rate !== null) {
        const payroll = calculatePayroll({
          totalHours: hours,
          absentDays: absences,
          hourlyRate: rate,
          totalAdvances: workerAdvances,
        });
        grossPay += payroll.grossPay;
        netPay += payroll.netPay;
      }

      if (selectedWork.workersWithRecords.has(id)) currentRecordedWorkers += 1;
      if (previousWork.workersWithRecords.has(id)) previousRecordedWorkers += 1;

      // Each month's average uses ALL of that month's fully recorded workers.
      // They do not need to be the same people in the two months.
      if (hasFullMonthRecords(selectedWork, id, daysCurrent) && validRate(rate)) {
        currentIncludedCount += 1;
        currentIncludedGross += grossPayForWorker(selectedWork, id, rate);
      }

      const previousRate = previousRateByWorker.get(id);
      if (hasFullMonthRecords(previousWork, id, daysPrevious) && validRate(previousRate)) {
        previousIncludedCount += 1;
        previousIncludedGross += grossPayForWorker(previousWork, id, previousRate);
      }
    }

    let averageGrossPayTrendAED = null;
    let averageGrossPayTrendPercent = null;

    // Minimum 9 workers with records in EACH month. The averages themselves
    // exclude every worker without a full month's distinct dates or valid rate.
    if (
      currentRecordedWorkers >= MIN_RECORDED_WORKERS_FOR_TREND &&
      previousRecordedWorkers >= MIN_RECORDED_WORKERS_FOR_TREND &&
      currentIncludedCount > 0 && previousIncludedCount > 0 &&
      previousIncludedGross > 0
    ) {
      const currentAverage = currentIncludedGross / currentIncludedCount;
      const previousAverage = previousIncludedGross / previousIncludedCount;
      const differenceAED = currentAverage - previousAverage;
      const percentage = (differenceAED / previousAverage) * 100;
      if (Number.isFinite(differenceAED) && Number.isFinite(percentage)) {
        averageGrossPayTrendAED = money(differenceAED);
        averageGrossPayTrendPercent = Math.round(percentage * 100) / 100;
      }
    }

    return {
      id: company.id,
      code: company.code,
      name: company.name,
      activeWorkerCount: company.workers.filter(
        (worker) => getWorkerStatusForMonth(worker, currentMonth) === "ACTIVE"
      ).length,
      totalHours,
      grossPay: money(grossPay),
      remainingPay: money(netPay - totalAdvances),
      averageGrossPayTrendAED,
      averageGrossPayTrendPercent,
      // "For N workers" refers to qualifying workers in the selected month.
      averageGrossPayTrendWorkerCount:
        averageGrossPayTrendAED === null ? null : currentIncludedCount,
      averageGrossPayTrendPreviousWorkerCount:
        averageGrossPayTrendAED === null ? null : previousIncludedCount,
    };
  });

  res.json({
    month,
    companies: result,
    companiesCount: result.length,
    workersCount: result.reduce((sum, company) => sum + company.activeWorkerCount, 0),
    expiring,
  });
});
