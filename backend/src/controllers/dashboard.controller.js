import { prisma } from "../lib/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { monthSchema, monthRange, currentUaeMonthString } from "../utils/dates.js";
import { getWorkerStatusForMonth } from "../utils/workerStatus.js";
import { calculatePayroll, money } from "../utils/payroll.js";
import { findExpiring } from "./documents.controller.js"; // adjust path

export const getDashboard = asyncHandler(async (req, res) => {
  const parsed = monthSchema.safeParse(req.query.month ?? currentUaeMonthString());
  if (!parsed.success) throw ApiError.badRequest("month must be YYYY-MM");

  const month = parsed.data;
  const { start, end } = monthRange(month);
  const currentMonth = currentUaeMonthString(); // active counts use today's month, as listCompanies does

  const [companies, attendance, rates, advances, expiring] = await Promise.all([
    prisma.company.findMany({
      orderBy: { code: "asc" },
      select: {
        id: true, code: true, name: true,
        workers: { select: { id: true, joiningDate: true, leavingDate: true } },
      },
    }),
    prisma.workRecord.groupBy({
      by: ["workerId", "status"],
      where: { workDate: { gte: start, lt: end } },
      _sum: { hours: true },
      _count: { _all: true },
    }),
    prisma.workerPayroll.findMany({
      where: { payrollMonth: start },
      select: { workerId: true, hourlyRate: true },
    }),
    prisma.advancePayment.groupBy({
      by: ["workerId"],
      where: { payrollMonth: start },
      _sum: { amount: true },
    }),
    findExpiring({ days: 30, activeOnly: true }),
  ]);

  const hoursByWorker = new Map();
  const absentByWorker = new Map();
  for (const row of attendance) {
    if (row.status === "WORKED")
      hoursByWorker.set(row.workerId, Number(row._sum.hours ?? 0));
    else if (row.status === "ABSENT")
      absentByWorker.set(row.workerId, row._count._all);
  }
  const rateByWorker = new Map(rates.map((r) => [r.workerId, Number(r.hourlyRate)]));
  const advanceByWorker = new Map(advances.map((a) => [a.workerId, Number(a._sum.amount ?? 0)]));

  const result = companies.map((company) => {
    let totalHours = 0, grossPay = 0, netPay = 0, totalAdvances = 0;

    for (const worker of company.workers) {
      const hours = hoursByWorker.get(worker.id) ?? 0;
      const workerAdvances = advanceByWorker.get(worker.id) ?? 0;
      totalHours += hours;
      totalAdvances += workerAdvances;

      const hourlyRate = rateByWorker.get(worker.id);
      if (hourlyRate === undefined) continue; // same as getCompanyStats

      const payroll = calculatePayroll({
        totalHours: hours,
        absentDays: absentByWorker.get(worker.id) ?? 0,
        hourlyRate,
        totalAdvances: workerAdvances,
      });
      grossPay += payroll.grossPay;
      netPay += payroll.netPay;
    }

    return {
      id: company.id,
      code: company.code,
      name: company.name,
      activeWorkerCount: company.workers.filter(
        (w) => getWorkerStatusForMonth(w, currentMonth) === "ACTIVE",
      ).length,
      totalHours,
      grossPay: money(grossPay),
      remainingPay: money(netPay - totalAdvances),
    };
  });

  res.json({
    month,
    companies: result,
    companiesCount: result.length,
    workersCount: result.reduce((sum, c) => sum + c.activeWorkerCount, 0),
    expiring,
  });
});