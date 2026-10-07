import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const createClientSchema = z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().email().optional(),
  address: z.string().trim().max(500).optional(),
  active: z.boolean().optional(),
});

export const updateClientSchema = createClientSchema.partial();

export const listClientsQuerySchema = z.object({
  search: z.string().trim().optional(),
  active: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
});

export const listClients = asyncHandler(async (req, res) => {
  const { search, active } = req.query;

  const clients = await prisma.client.findMany({
    where: {
      active,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { code: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
  });

  res.json({ clients });
});

export const getClient = asyncHandler(async (req, res) => {
  const client = await prisma.client.findUnique({ where: { id: req.params.id } });
  if (!client) throw ApiError.notFound("Client not found");
  res.json({ client });
});

export const createClient = asyncHandler(async (req, res) => {
  const client = await prisma.client.create({ data: req.body });
  res.status(201).json({ client });
});

export const updateClient = asyncHandler(async (req, res) => {
  const existing = await prisma.client.findUnique({ where: { id: req.params.id } });
  if (!existing) throw ApiError.notFound("Client not found");

  const client = await prisma.client.update({ where: { id: req.params.id }, data: req.body });
  res.json({ client });
});
