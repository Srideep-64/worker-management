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
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});

export const listWorkers = asyncHandler(async (req, res) => {
  const { search, companyId, page, pageSize } = req.query;

  const where = {
    ...(companyId ? { companyId } : {}),
    ...(search
      ? {
          OR: [
            { workerCode: { contains: search, mode: "insensitive" } },
            { name: { contains: search, mode: "insensitive" } },
          ],
        }
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
        company: {
          select: { id: true, code: true, name: true },
        },
      },
    }),
    prisma.worker.count({ where }),
  ]);

  res.json({
    workers,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  });
})

export const getWorker = asyncHandler(async (req, res) => {
  const worker = await prisma.worker.findUnique({
    where: { id: req.params.id },
    include: {
      company: {
        select: { id: true, code: true, name: true },
      },
    },
  });

  if (!worker) throw ApiError.notFound("Worker not found");

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
