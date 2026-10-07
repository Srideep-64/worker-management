import { z } from "zod";

export const createCompanySchema = z.object({
  code: z.string().trim().min(1).max(10),
  name: z.string().trim().min(1).max(200),
});

export const updateCompanySchema = createCompanySchema.partial();

export const statsQuerySchema = z.object({
  // YYYY-MM — defaults to the current month in the controller if omitted.
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "month must be in YYYY-MM format")
    .optional(),
});
