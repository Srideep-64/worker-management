
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  currentUaeMonthString,
  dateOnly,
  monthRange,
} from "../utils/dates.js";

const dateString = z.coerce.date();
const nullableDateString = dateString.nullable().optional();

export const createWorkerSchema = z.object({
  workerCode: z
    .string()
    .trim()
    .regex(
      /^[A-Z]{2,4}\d{3,6}$/,
      "Worker code must contain 2–4 uppercase letters followed by 3–6 digits",
    ),

  companyId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),

  passportNumber: z.string().trim().max(50).optional(),
  passportExpiry: dateString.optional(),
  nationality: z.string().trim().max(100).optional(),
  dateOfBirth: dateString.optional(),
  phone: z.string().trim().max(30).optional(),

  visaNumber: z.string().trim().max(50).optional(),
  visaExpiry: dateString.optional(),

  emiratesIdNumber: z.string().trim().max(50).optional(),
  emiratesIdExpiry: dateString.optional(),

  labourCardNumber: z.string().trim().max(50).optional(),
  jobTitle: z.string().trim().max(100).optional(),

  joiningDate: dateString,
  leavingDate: nullableDateString,
});

export const updateWorkerSchema = createWorkerSchema
  .omit({
    companyId: true,
    workerCode: true,
  })
  .partial()
  .extend({
    leavingDate: nullableDateString,
  });

export const listWorkersQuerySchema = z.object({
  search: z.string().trim().optional().default(""),
  companyId: z.string().uuid().optional(),

  status: z
    .enum(["ACTIVE", "INACTIVE", "ALL"])
    .optional()
    .default("ALL"),

  month: z.string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),

  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(30).optional(),
  pageSize: z.coerce.number().int().min(1).max(30).optional(),
}).transform((query) => ({
  ...query,
  limit: query.pageSize ?? query.limit ?? 20,
}));


// A leaving date anywhere in the current month means the worker
// remains active for the entire current month.
function getWorkerStatus(worker) {
  return getWorkerStatusForMonth(worker, currentUaeMonthString());
}

function getWorkerStatusForMonth(worker, month) {
  const { start, end } = monthRange(month);

  const selectedMonthStart = dateOnly(start);
  const nextMonthStart = dateOnly(end);

  const joiningDate = dateOnly(worker.joiningDate);
  const leavingDate = dateOnly(worker.leavingDate);

  if (joiningDate && joiningDate >= nextMonthStart) {
    return "INACTIVE";
  }

  if (leavingDate && leavingDate < selectedMonthStart) {
    return "INACTIVE";
  }

  return "ACTIVE";
}


function withWorkerStatus(worker) {
  return {
    ...worker,
    status: getWorkerStatus(worker),
  };
}

export const listWorkers = asyncHandler(async (req, res) => {
  const {
    search,
    companyId,
    status,
    month,
    page,
    limit,
  } = listWorkersQuerySchema.parse(req.query);

  const reportingMonth =
    month || currentUaeMonthString();

  const where = {};

  if (companyId) {
    where.companyId = companyId;
  }

  if (search) {
    where.OR = [
      {
        workerCode: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        name: {
          contains: search,
          mode: "insensitive",
        },
      },
    ];
  }

  const allWorkers = await prisma.worker.findMany({
    where,
    orderBy: [
      { name: "asc" },
      { workerCode: "asc" },
    ],
    select: {
      id: true,
      workerCode: true,
      name: true,
      jobTitle: true,
      nationality: true,
      joiningDate: true,
      leavingDate: true,
      company: {
        select: {
          id: true,
          name: true,
          code:true,
        },
      },
    },
  });

  const workersWithStatus = allWorkers.map((worker) => ({
    ...worker,
    status: getWorkerStatusForMonth(worker, reportingMonth),
  }));

  const filteredWorkers =
    status === "ALL"
      ? workersWithStatus
      : workersWithStatus.filter(
          (worker) => worker.status === status,
        );

  const total = filteredWorkers.length;
  const skip = (page - 1) * limit;

  res.json({
    workers: filteredWorkers.slice(skip, skip + limit),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});


export const getWorker = asyncHandler(async (req, res) => {
  const worker = await prisma.worker.findUnique({
    where: { id: req.params.id },
    include: {
      company: true,
    },
  });

  if (!worker) {
    throw new ApiError(404, "Worker not found");
  }

  const latestWorkRecord = await prisma.workRecord.findFirst({
    where: {
      workerId: req.params.id,
    },
    orderBy: {
      workDate: "desc",
    },
    select: {
      workDate: true,
    },
  });

  res.json({
    worker: {
      ...withWorkerStatus(worker),
      latestWorkDate: dateOnly(latestWorkRecord?.workDate),
    },
  });
});


export const createWorker = asyncHandler(async (req, res) => {
  const data = createWorkerSchema.parse(req.body);

  const company = await prisma.company.findUnique({
    where: { id: data.companyId },
    select: { id: true },
  });

  if (!company) {
    throw new ApiError(404, "Company not found");
  }

  const worker = await prisma.worker.create({
    data,
    include: {
      company: true,
    },
  });

  res.status(201).json({
    worker: withWorkerStatus(worker),
  });
});


export const updateWorker = asyncHandler(async (req, res) => {
  const data = updateWorkerSchema.parse(req.body);

  const existingWorker = await prisma.worker.findUnique({
    where: { id: req.params.id },
    select: { id: true },
  });

  if (!existingWorker) {
    throw new ApiError(404, "Worker not found");
  }

  // Reject a leaving date if any work record exists after it.
  // This checks both manual attendance and uploaded timesheets.
  if (data.leavingDate) {
    const laterWorkRecord = await prisma.workRecord.findFirst({
      where: {
        workerId: req.params.id,
        workDate: {
          gt: data.leavingDate,
        },
      },
      orderBy: {
        workDate: "asc",
      },
      select: {
        workDate: true,
      },
    });

    if (laterWorkRecord) {
      throw ApiError.badRequest(
        `Leaving date cannot be earlier than an existing work record (${dateOnly(laterWorkRecord.workDate)}).`,
      );
    }
  }

  // A null leavingDate clears the leaving date.
  const worker = await prisma.worker.update({
    where: { id: req.params.id },
    data,
    include: {
      company: true,
    },
  });

  res.json({
    worker: withWorkerStatus(worker),
  });
});
