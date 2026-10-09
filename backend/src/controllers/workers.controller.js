import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const dateString = z.coerce.date();

export const createWorkerSchema = z.object({
  workerCode: z
  .string()
  .trim()
  .regex( /^[A-Z]{2,4}\d{3,6}$/, "worker_code must contain 2–4 uppercase letters followed by 5–6 digits" ),
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
  joiningDate: dateString.optional(),
});

// companyId is intentionally excluded from updates: "a worker permanently
// belongs to exactly one company" per spec, so moving a worker between
// companies isn't a supported operation for v1.
export const updateWorkerSchema = createWorkerSchema.omit({ companyId: true, workerCode: true }).partial();

export const listWorkersQuerySchema = z.object({
  search: z.string().trim().optional(), // matches worker_code or name
  companyId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(), // filters to workers currently assigned to this client
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});

export const listWorkers = asyncHandler(async (req, res) => {
  const { search, companyId, clientId, page, pageSize } = req.query;

  // Note: filtering by role is not offered here. Role is a per-day attribute
  // of a work_record, not a permanent property of a worker (a worker can be
  // ET on Monday and HP on Tuesday) — this filter becomes meaningful once
  // Phase 3's work_records exist ("workers who worked as ET this month").
  const where = {
    companyId,
    ...(search
      ? {
          OR: [
            { workerCode: { contains: search, mode: "insensitive" } },
            { name: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(clientId
      ? { assignments: { some: { clientId, endDate: null } } }
      : {}),
  };

  const [workers, total] = await Promise.all([
    prisma.worker.findMany({
      where,
      orderBy: { workerCode: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        workerCode: true,
        name: true,
        jobTitle: true,
        nationality: true,
        company: { select: { id: true, code: true, name: true } },
        assignments: {
          where: { endDate: null },
          take: 1,
          select: { client: { select: { id: true, code: true, name: true } } },
        },
      },
    }),
    prisma.worker.count({ where }),
  ]);

  res.json({
    workers: workers.map((w) => ({
      id: w.id,
      workerCode: w.workerCode,
      name: w.name,
      jobTitle: w.jobTitle,
      nationality: w.nationality,
      company: w.company,
      currentClient: w.assignments[0]?.client ?? null,
    })),
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
});

export const getWorker = asyncHandler(async (req, res) => {
  const worker = await prisma.worker.findUnique({
    where: { id: req.params.id },
    include: {
      company: { select: { id: true, code: true, name: true } },
      // Full document/work-calendar payloads are added in Phases 3 and 5;
      // for now this returns everything the DB actually holds for a worker.
      assignments: {
        orderBy: { startDate: "desc" },
        include: { client: { select: { id: true, code: true, name: true } } },
      },
    },
  });

  if (!worker) throw ApiError.notFound("Worker not found");

  // Never return identity-document numbers in a broader payload than needed —
  // this endpoint is the worker's own profile, so it's appropriate here, but
  // listWorkers deliberately omits passport/visa/Emirates ID fields entirely.
  res.json({ worker });
});

export const createWorker = asyncHandler(async (req, res) => {
  const company = await prisma.company.findUnique({ where: { id: req.body.companyId } });
  if (!company) throw ApiError.badRequest("companyId does not reference an existing company");

  const worker = await prisma.worker.create({ data: req.body });
  res.status(201).json({ worker });
});

export const updateWorker = asyncHandler(async (req, res) => {
  const existing = await prisma.worker.findUnique({ where: { id: req.params.id } });
  if (!existing) throw ApiError.notFound("Worker not found");

  const worker = await prisma.worker.update({ where: { id: req.params.id }, data: req.body });
  res.json({ worker });
});

// --- Assignments ---

export const createAssignmentSchema = z.object({
  clientId: z.string().uuid(),
  startDate: dateString,
  endDate: dateString.optional(),
});

export const listAssignments = asyncHandler(async (req, res) => {
  const worker = await prisma.worker.findUnique({ where: { id: req.params.id } });
  if (!worker) throw ApiError.notFound("Worker not found");

  const assignments = await prisma.workerAssignment.findMany({
    where: { workerId: req.params.id },
    orderBy: { startDate: "desc" },
    include: { client: { select: { id: true, code: true, name: true } } },
  });

  res.json({ assignments });
});

export const createAssignment = asyncHandler(async (req, res) => {
  const workerId = req.params.id;
  const { clientId, startDate, endDate } = req.body;

  if (endDate && endDate < startDate) {
    throw ApiError.badRequest("endDate cannot be before startDate");
  }

  const [worker, client] = await Promise.all([
    prisma.worker.findUnique({ where: { id: workerId } }),
    prisma.client.findUnique({ where: { id: clientId } }),
  ]);
  if (!worker) throw ApiError.notFound("Worker not found");
  if (!client) throw ApiError.badRequest("clientId does not reference an existing client");

  // Overlap check + insert happen in one transaction so a concurrent request
  // can't slip an overlapping assignment in between the check and the write.
  // A DB-level EXCLUDE constraint (see prisma/manual_migrations) backs this
  // up in case application logic is ever bypassed.
  const assignment = await prisma.$transaction(async (tx) => {
    const newRange = {
      start: startDate,
      end: endDate ?? null,
    };

    const existingAssignments = await tx.workerAssignment.findMany({
      where: { workerId },
      select: { startDate: true, endDate: true },
    });

    const overlaps = existingAssignments.some((a) => rangesOverlap(newRange, {
      start: a.startDate,
      end: a.endDate,
    }));

    if (overlaps) {
      throw ApiError.conflict("This worker already has a client assignment covering part of this date range");
    }

    return tx.workerAssignment.create({
      data: { workerId, clientId, startDate, endDate: endDate ?? null },
      include: { client: { select: { id: true, code: true, name: true } } },
    });
  });

  res.status(201).json({ assignment });
});

function rangesOverlap(a, b) {
  const aEnd = a.end ?? Infinity;
  const bEnd = b.end ?? Infinity;
  const aStart = a.start.getTime();
  const bStart = b.start.getTime();
  const aEndVal = aEnd === Infinity ? Infinity : aEnd.getTime();
  const bEndVal = bEnd === Infinity ? Infinity : bEnd.getTime();
  return aStart <= bEndVal && bStart <= aEndVal;
}
