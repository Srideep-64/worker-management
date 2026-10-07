import { z } from "zod";

const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .transform((s) => new Date(`${s}T00:00:00.000Z`));

export const listWorkersQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  companyId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  roleId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const createWorkerSchema = z.object({
  workerCode: z.string().trim().min(1).max(20),
  companyId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  passportNumber: z.string().trim().max(50).optional(),
  passportExpiry: dateStr.optional(),
  nationality: z.string().trim().max(100).optional(),
  dateOfBirth: dateStr.optional(),
  phone: z.string().trim().max(30).optional(),
  visaNumber: z.string().trim().max(50).optional(),
  visaExpiry: dateStr.optional(),
  emiratesIdNumber: z.string().trim().max(50).optional(),
  emiratesIdExpiry: dateStr.optional(),
  labourCardNumber: z.string().trim().max(50).optional(),
  jobTitle: z.string().trim().max(100).optional(),
  joiningDate: dateStr.optional(),
});

export const updateWorkerSchema = createWorkerSchema.partial().omit({ workerCode: true });
// worker_code is the business identifier used to match Excel rows — allowing
// it to be edited after the fact would silently break historical timesheet
// links, so it's immutable once a worker is created.

export const workQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "month must be in YYYY-MM format")
    .optional(),
});
