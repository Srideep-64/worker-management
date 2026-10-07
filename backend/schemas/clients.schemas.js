import { z } from "zod";

export const createClientSchema = z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().email().optional(),
  address: z.string().trim().max(300).optional(),
  active: z.boolean().default(true),
});

export const updateClientSchema = createClientSchema.partial();

export const listClientsQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  active: z.coerce.boolean().optional(),
});
