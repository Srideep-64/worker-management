
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const dateString = z.coerce.date();
const nullableDateString = dateString.nullable().optional();

export const createWorkerSchema = z.object({
  workerCode: z
    .string()
    .trim()
    .regex(
      /^[A-Z]{2,4}\d{3,6}$/,
      "Worker code must contain 2–4 uppercase letters followed by 5–6 digits",
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
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
}).transform((query) => ({
  ...query,
  limit: query.limit ?? query.pageSize ?? 20,
}));

// Use the UAE calendar date when deciding whether a worker has joined.
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

// Prisma returns Date objects for DateTime fields.
// Format them as YYYY-MM-DD without using the server's local timezone.
function dateOnly(value) {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString().slice(0, 10);
}

function getUaeCalendarDates() {
  const { year, month, day } = getUaeDateParts();

  return {
    todayString: `${year}-${month}-${day}`,
    monthStartString: `${year}-${month}-01`,
  };
}

// A leaving date anywhere in the current month means the worker
// remains active for the entire current month.
function getWorkerStatus(worker) {
  const { todayString, monthStartString } = getUaeCalendarDates();

  const joiningDate = dateOnly(worker.joiningDate);
  const leavingDate = dateOnly(worker.leavingDate);

  const hasJoined = joiningDate && joiningDate <= todayString;

  const hasNotLeftYet =
    !leavingDate || leavingDate >= monthStartString;

  return hasJoined && hasNotLeftYet ? "ACTIVE" : "INACTIVE";
}


function getWorkerStatusForMonth(worker, month) {
  const [year, monthNumber] = month.split("-").map(Number);

  const selectedMonthStart =
    `${year}-${String(monthNumber).padStart(2, "0")}-01`;

  const nextMonthDate = new Date(
    Date.UTC(year, monthNumber, 1),
  );

  const nextMonthStart = nextMonthDate
    .toISOString()
    .slice(0, 10);

  const joiningDate = dateOnly(worker.joiningDate);
  const leavingDate = dateOnly(worker.leavingDate);

  // The worker has not joined by the selected month.
  if (joiningDate && joiningDate >= nextMonthStart) {
    return "INACTIVE";
  }

  // A worker remains active throughout their leaving month.
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

// Construct UTC-midnight dates from UAE calendar date strings.
// These are used for Prisma's @db.Date comparisons.
function getDateBoundaries() {
  const { todayString, monthStartString } = getUaeCalendarDates();

  return {
    today: new Date(`${todayString}T00:00:00.000Z`),
    monthStart: new Date(`${monthStartString}T00:00:00.000Z`),
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
    month || getUaeCalendarDates().todayString.slice(0, 7);

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

  res.json({
    worker: withWorkerStatus(worker),
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

  // companyId and workerCode are intentionally excluded from this schema.
  // A null leavingDate clears the departure date.
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
