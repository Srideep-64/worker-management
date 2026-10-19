import { z } from "zod";

const dateString = z.coerce.date();
const nullableDateString = dateString.nullable().optional();

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

export const workQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "month must be in YYYY-MM format")
    .optional(),
});
