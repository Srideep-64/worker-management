
import { prisma } from "../lib/prisma.js";
import { monthRange } from "./dates.js";
import { ApiError } from "./ApiError.js";

// Uses the project's existing monthRange helper.
// If that helper lives elsewhere, adjust the import above.

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

  const workers = await prisma.worker.findMany({
    where: {
      companyId,
      OR: [
        { isActive: true },
        {
          workRecords: {
            some: {
              workDate: { gte: start, lt: end },
            },
          },
        },
      ],
    },
    orderBy: { workerCode: "asc" },
    select: {
      id: true,
      workerCode: true,
      name: true,
      jobTitle: true,
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
            select: { code: true, name: true },
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

  const daysInMonth = new Date(
    Date.UTC(
      Number(month.slice(0, 4)),
      Number(month.slice(5, 7)),
      0
    )
  ).getUTCDate();

  const money = (value) =>
    Math.round((value + Number.EPSILON) * 100) / 100;

  const reportWorkers = workers.map((worker) => {
    const recordByDay = new Map(
      worker.workRecords.map((record) => [
        new Date(record.workDate).getUTCDate(),
        record,
      ])
    );

    const dailyRecords = Array.from(
      { length: daysInMonth },
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

    const grossPay =
      hourlyRate === null
        ? null
        : money(totalHours * hourlyRate);

    const absenceDeduction =
      hourlyRate === null
        ? null
        : money(Math.max(0, absentDays - 2) * 25);

    const netPay =
      grossPay === null
        ? null
        : money(grossPay - absenceDeduction);

    const totalAdvances = money(
      worker.advancePayments.reduce(
        (sum, advance) => sum + Number(advance.amount),
        0
      )
    );

    const remainingPay =
      netPay === null
        ? null
        : money(netPay - totalAdvances);

    const roles = [
      ...new Set(
        dailyRecords
          .filter((record) => record.roleCode)
          .map((record) => record.roleCode)
      ),
    ];

    return {
      workerCode: worker.workerCode,
      name: worker.name,
      role: roles.join(", ") || worker.jobTitle || "—",
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
    daysInMonth,
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

        // Includes advances for every worker, even if their rate is missing.
        totalAdvances: sum("totalAdvances"),

        // Only sum remaining pay where it can actually be calculated.
        remainingPay: sum("remainingPay"),
        },
  };
}
