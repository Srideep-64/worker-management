import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const createCompanySchema = z.object({
  code: z.string().trim().min(1).max(10),
  name: z.string().trim().min(1).max(200),
});

export const listCompanies = asyncHandler(async (req, res) => {
  const companies = await prisma.company.findMany({
    orderBy: { code: "asc" },
    include: { _count: { select: { workers: true } } },
  });

  res.json({
    companies: companies.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      workerCount: c._count.workers,
      createdAt: c.createdAt,
    })),
  });
});

export const getCompany = asyncHandler(async (req, res) => {
  const company = await prisma.company.findUnique({ where: { id: req.params.id } });
  if (!company) throw ApiError.notFound("Company not found");
  res.json({ company });
});

export const createCompany = asyncHandler(async (req, res) => {
  const company = await prisma.company.create({ data: req.body });
  res.status(201).json({ company });
});
