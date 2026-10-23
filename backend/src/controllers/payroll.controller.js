
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { calculatePayroll } from "../utils/payroll.js";
import {
  monthSchema,
  monthRange,
  monthStartDate,
} from "../utils/dates.js";
import { logActivity, monthLabel } from "../lib/activityLog.js";

const WORKER_LOG_SELECT = { id: true, workerCode: true, name: true, companyId: true };

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


// GET /api/workers/:id/payroll?month=YYYY-MM

export const getWorkerPayroll = asyncHandler(async (req, res) => {
  const worker = await prisma.worker.findUnique({
    where: { id: req.params.id },
    select: { id: true },
  });

  if (!worker) {
    throw ApiError.notFound("Worker not found");
  }

  const { month } = payrollMonthSchema.parse(req.query);

  const { start: payrollMonth, end: nextMonth } =
    monthRange(month);
    
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
    select: WORKER_LOG_SELECT,
  });

  if (!worker) {
    throw ApiError.notFound("Worker not found");
  }

  const { month, hourlyRate } =
  updateHourlyRateSchema.parse(req.body);

  const payrollMonth = monthStartDate(month);

  const previous = await prisma.workerPayroll.findUnique({
    where: { workerId_payrollMonth: { workerId: worker.id, payrollMonth } },
    select: { hourlyRate: true },
  });

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

  const oldRate = previous ? Number(previous.hourlyRate) : null;
  const newRate = Number(updated.hourlyRate);

  if (oldRate !== newRate) {
    await logActivity({
      user: req.user,
      category: "PAYROLL",
      action: oldRate == null ? "CREATE" : "UPDATE",
      description:
        oldRate == null
          ? `Set hourly rate for worker ${worker.workerCode} for ${monthLabel(month)} to AED ${newRate.toFixed(2)}`
          : `Changed hourly rate for worker ${worker.workerCode} for ${monthLabel(month)} from AED ${oldRate.toFixed(2)} to AED ${newRate.toFixed(2)}`,
      workerId: worker.id,
      workerCode: worker.workerCode,
      companyId: worker.companyId,
      entityType: "WorkerPayroll",
      metadata: { workerName: worker.name, month, from: oldRate, to: newRate },
    });
  }

  res.json({
    month,
    hourlyRate:newRate,
  });
});

// POST /api/workers/:id/advances
export const createAdvance = asyncHandler(async (req, res) => {
  const worker = await prisma.worker.findUnique({
    where: { id: req.params.id },
    select: WORKER_LOG_SELECT,
  });

  if (!worker) {
    throw ApiError.notFound("Worker not found");
  }

  const {
    payrollMonth,
    amount,
    paidAt,
    note,
  } = createAdvanceSchema.parse(req.body);

  const advance = await prisma.advancePayment.create({
    data: {
      workerId: worker.id,
      payrollMonth: monthStartDate(payrollMonth),
      amount,
      createdById: req.user.id,
      ...(paidAt ? { paidAt } : {}),
      ...(note ? { note } : {}),
    },
    include: {
      createdBy: {
        select: { name: true },
      },
    },
  });

    await logActivity({
    user: req.user,
    category: "PAYROLL",
    action: "CREATE",
    description: `Recorded advance payment of AED ${Number(advance.amount).toFixed(2)} for worker ${worker.workerCode} for ${monthLabel(payrollMonth)}`,
    workerId: worker.id,
    workerCode: worker.workerCode,
    companyId: worker.companyId,
    entityType: "AdvancePayment",
    entityId: advance.id,
    metadata: { workerName: worker.name, month: payrollMonth, amount: Number(advance.amount) },
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
  const advance = await prisma.advancePayment.findFirst({
    where: { id: req.params.advanceId, workerId: req.params.id },
    include: { worker: { select: WORKER_LOG_SELECT } },
  });

  if (!advance) throw ApiError.notFound("Advance payment not found");

  const result = await prisma.advancePayment.deleteMany({
    where: { id: advance.id, workerId: advance.workerId },
  });

  if (result.count === 0) throw ApiError.notFound("Advance payment not found");

  const month = advance.payrollMonth.toISOString().slice(0, 7);

  await logActivity({
    user: req.user,
    category: "PAYROLL",
    action: "DELETE",
    description: `Deleted advance payment of AED ${Number(advance.amount).toFixed(2)} for worker ${advance.worker.workerCode} for ${monthLabel(month)}`,
    workerId: advance.worker.id,
    workerCode: advance.worker.workerCode,
    companyId: advance.worker.companyId,
    entityType: "AdvancePayment",
    entityId: advance.id,
    metadata: { workerName: advance.worker.name, month, amount: Number(advance.amount) },
  });

  res.json({ message: "Advance payment deleted" });
});
