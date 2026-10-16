
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { monthSchema } from "../utils/dates.js";
import { calculatePayroll } from "../utils/payroll.js";

export const payrollMonthSchema = z.object({
  month: monthSchema,
});

export const updateHourlyRateSchema = z.object({
  month: monthSchema,
  hourlyRate: z.coerce.number().min(0).max(100000).finite(),
});

export const createAdvanceSchema = z.object({
  payrollMonth: monthSchema,
  amount: z.coerce.number().gt(0).max(10000000).finite(),
  paidAt: z.coerce.date().optional(),
  note: z.string().trim().max(500).optional(),
});

function monthStartDate(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber - 1, 1));
}

// GET /api/workers/:id/payroll?month=YYYY-MM

export const getWorkerPayroll = asyncHandler(async (req, res) => {
  const worker = await prisma.worker.findUnique({
    where: { id: req.params.id },
    select: { id: true },
  });

  if (!worker) {
    throw ApiError.notFound("Worker not found");
  }

  const month = req.query.month;
  const payrollMonth = monthStartDate(month);
  const nextMonth = new Date(
    Date.UTC(
      payrollMonth.getUTCFullYear(),
      payrollMonth.getUTCMonth() + 1,
      1,
    ),
  );

  const [monthlyPayroll, advances, workRecords] =
    await Promise.all([
      prisma.workerPayroll.findUnique({
        where: {
          workerId_payrollMonth: {
            workerId: worker.id,
            payrollMonth,
          },
        },
        select: { hourlyRate: true },
      }),

      prisma.advancePayment.findMany({
        where: {
          workerId: worker.id,
          payrollMonth,
        },
        orderBy: [
          { paidAt: "asc" },
          { createdAt: "asc" },
        ],
        include: {
          createdBy: {
            select: { name: true },
          },
        },
      }),

      prisma.workRecord.findMany({
        where: {
          workerId: worker.id,
          workDate: {
            gte: payrollMonth,
            lt: nextMonth,
          },
        },
        select: {
          status: true,
          hours: true,
        },
      }),
    ]);

  const totalHours = workRecords.reduce(
    (sum, record) =>
      sum +
      (record.status === "WORKED"
        ? Number(record.hours ?? 0)
        : 0),
    0,
  );

  const absentDays = workRecords.filter(
    (record) => record.status === "ABSENT",
  ).length;

  const hourlyRate =
    monthlyPayroll == null
      ? null
      : Number(monthlyPayroll.hourlyRate);

  const totalAdvances = advances.reduce(
    (sum, advance) => sum + Number(advance.amount),
    0,
  );

  const calculations = calculatePayroll({
    totalHours,
    absentDays,
    hourlyRate,
    totalAdvances,
  });

  res.json({
    month,
    hourlyRate,
    totalHours,
    absentDays,
    ...calculations,
    advances: advances.map((advance) => ({
      id: advance.id,
      amount: Number(advance.amount),
      paidAt: advance.paidAt,
      note: advance.note,
      createdByName: advance.createdBy?.name ?? null,
    })),
  });
});


// PATCH /api/workers/:id/payroll/rate
export const updateHourlyRate = asyncHandler(async (req, res) => {
  const worker = await prisma.worker.findUnique({
    where: { id: req.params.id },
    select: { id: true },
  });

  if (!worker) {
    throw ApiError.notFound("Worker not found");
  }

  const { month, hourlyRate } = req.body;
  const payrollMonth = monthStartDate(month);

  const updated = await prisma.workerPayroll.upsert({
    where: {
      workerId_payrollMonth: {
        workerId: worker.id,
        payrollMonth,
      },
    },
    create: {
      workerId: worker.id,
      payrollMonth,
      hourlyRate,
    },
    update: {
      hourlyRate,
    },
    select: {
      hourlyRate: true,
    },
  });

  res.json({
    month,
    hourlyRate: Number(updated.hourlyRate),
  });
});

// POST /api/workers/:id/advances
export const createAdvance = asyncHandler(async (req, res) => {
  const worker = await prisma.worker.findUnique({
    where: { id: req.params.id },
    select: { id: true },
  });

  if (!worker) {
    throw ApiError.notFound("Worker not found");
  }

    const advance = await prisma.advancePayment.create({
    data: {
        workerId: worker.id,
        payrollMonth: monthStartDate(req.body.payrollMonth),
        amount: req.body.amount,
        createdById: req.user.id,
        ...(req.body.paidAt ? { paidAt: req.body.paidAt } : {}),
        ...(req.body.note ? { note: req.body.note } : {}),
    },
    include: {
        createdBy: {
        select: { name: true },
        },
    },
    });

  res.status(201).json({
    advance: {
      id: advance.id,
      amount: Number(advance.amount),
      paidAt: advance.paidAt,
      note: advance.note,
      createdByName: advance.createdBy?.name ?? null,
    },
  });
});

// DELETE /api/workers/:id/advances/:advanceId
export const deleteAdvance = asyncHandler(async (req, res) => {
  const result = await prisma.advancePayment.deleteMany({
    where: {
      id: req.params.advanceId,
      workerId: req.params.id,
    },
  });

  if (result.count === 0) {
    throw ApiError.notFound("Advance payment not found");
  }

  res.json({ message: "Advance payment deleted" });
});
