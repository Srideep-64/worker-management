import { prisma } from "../lib/prisma.js";
import { monthRange,dateOnly,daysInMonth } from "./dates.js";
import { ApiError } from "./ApiError.js";
import { calculatePayroll, money } from "./payroll.js";

// Converts a date to YYYY-MM-DD for date-only comparisons.

function getWorkerStatusForMonth(worker, month) {
   const { start, end } = monthRange(month);

  const selectedMonthStart = dateOnly(start);
  const nextMonthStart = dateOnly(end);

  const joiningDate = dateOnly(worker.joiningDate);
  const leavingDate = dateOnly(worker.leavingDate);

  // Inactive before the worker's joining month.
  if (joiningDate && joiningDate >= nextMonthStart) {
    return "INACTIVE";
  }

  // Inactive only from the month AFTER the leaving month.
  if (leavingDate && leavingDate < selectedMonthStart) {
    return "INACTIVE";
  }

  return "ACTIVE";
}

export async function getCompanyMonthlyReport(companyId, month) {
  const { start, end } = monthRange(month);

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      code: true,
      name: true,
    },
  });

  if (!company) {
    throw ApiError.notFound("Company not found");
  }

  // Fetch all workers belonging to the company.
  const workers = await prisma.worker.findMany({
    where: {
      companyId,
    },
    orderBy: { workerCode: "asc" },
    select: {
      id: true,
      workerCode: true,
      name: true,
      jobTitle: true,
      joiningDate: true,
      leavingDate: true,

      workRecords: {
        where: {
          workDate: { gte: start, lt: end },
        },
        orderBy: { workDate: "asc" },
        select: {
          workDate: true,
          status: true,
          hours: true,
          role: {
            select: {
              code: true,
              name: true,
            },
          },
        },
      },

      payrolls: {
        where: { payrollMonth: start },
        select: { hourlyRate: true },
      },

      advancePayments: {
        where: { payrollMonth: start },
        select: { amount: true },
      },
    },
  });

  // Include workers classified as either ACTIVE or INACTIVE.
  // Attendance does not determine whether a worker is included.
const reportWorkersSource = workers.filter((worker) => {
  return getWorkerStatusForMonth(worker, month) === "ACTIVE";
});

  const totalDays = daysInMonth(month);

  const reportWorkers = reportWorkersSource.map((worker) => {
    const recordByDay = new Map(
      worker.workRecords.map((record) => [
        new Date(record.workDate).getUTCDate(),
        record,
      ])
    );

    const dailyRecords = Array.from(
      { length: totalDays },
      (_, index) => {
        const day = index + 1;
        const record = recordByDay.get(day);

        return {
          day,
          status: record?.status ?? null,
          hours:
            record?.hours == null
              ? null
              : Number(record.hours),
          roleCode: record?.role?.code ?? null,
          roleName: record?.role?.name ?? null,
        };
      }
    );

    const totalHours = money(
      dailyRecords.reduce(
        (sum, record) =>
          sum +
          (record.status === "WORKED"
            ? record.hours ?? 0
            : 0),
        0
      )
    );

    const count = (status) =>
      dailyRecords.filter(
        (record) => record.status === status
      ).length;

    const absentDays = count("ABSENT");
    const workedDays = count("WORKED");
    const holidays = count("HOLIDAY");
    const weeklyOffs = count("WEEKLY_OFF");

    const hourlyRate =
      worker.payrolls.length > 0
        ? Number(worker.payrolls[0].hourlyRate)
        : null;

    const totalAdvances = money(
      worker.advancePayments.reduce(
        (sum, advance) => sum + Number(advance.amount),
        0
      )
    );

    const payroll = calculatePayroll({
      totalHours,
      absentDays,
      hourlyRate,
      totalAdvances,
    });

    const {
      grossPay,
      absenceDeduction,
      netPay,
      remainingPay,
    } = payroll;

    const roles = [
      ...new Set(
        dailyRecords
          .filter((record) => record.roleCode)
          .map((record) => record.roleCode)
      ),
    ];

const roleCode =
  dailyRecords.find((record) => {
    const code = record.roleCode?.trim();

    return (
      code &&
      !["W", "A", "H"].includes(code.toUpperCase())
    );
  })?.roleCode ?? "-";

    return {
      workerCode: worker.workerCode,
      name: worker.name,
      roleCode,
      dailyRecords,
      totalHours,
      workedDays,
      absentDays,
      holidays,
      weeklyOffs,
      hourlyRate,
      grossPay,
      absenceDeduction,
      netPay,
      totalAdvances,
      remainingPay,
    };
  });

  const sum = (key) =>
    money(
      reportWorkers.reduce(
        (total, worker) => total + (worker[key] ?? 0),
        0
      )
    );

  return {
    company,
    month,
    daysInMonth :totalDays,
    generatedAt: new Date(),
    workers: reportWorkers,

    totals: {
      workerCount: reportWorkers.length,
      totalHours: sum("totalHours"),
      workedDays: sum("workedDays"),
      absentDays: sum("absentDays"),
      holidays: sum("holidays"),
      weeklyOffs: sum("weeklyOffs"),

      workersWithRate: reportWorkers.filter(
        (worker) => worker.hourlyRate !== null
      ).length,

      workersWithoutRate: reportWorkers.filter(
        (worker) => worker.hourlyRate === null
      ).length,

      grossPay: sum("grossPay"),
      absenceDeduction: sum("absenceDeduction"),
      netPay: sum("netPay"),

      // Includes advances for every worker, even without an hourly rate.
      totalAdvances: sum("totalAdvances"),

      // Only sums remaining pay where it can be calculated.
      remainingPay: sum("remainingPay"),
    },
  };
}