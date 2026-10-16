import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const createCompanySchema = z.object({
  code: z.string().trim().min(1).max(10),
  name: z.string().trim().min(1).max(200),
});


export const listCompanies = asyncHandler(async (req, res) => {
  // Use the current month in the UAE timezone.
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value])
  );

  const month = `${values.year}-${values.month}`;
  const [year, monthNumber] = month.split("-").map(Number);

  const monthStart = `${month}-01`;

  const nextMonthStart = new Date(
    Date.UTC(year, monthNumber, 1)
  )
    .toISOString()
    .slice(0, 10);

  const companies = await prisma.company.findMany({
    orderBy: { code: "asc" },
    include: {
      workers: {
        select: {
          joiningDate: true,
          leavingDate: true,
        },
      },
      _count: {
        select: { workers: true },
      },
    },
  });

  const dateOnly = (value) =>
    value ? new Date(value).toISOString().slice(0, 10) : null;

  res.json({
    companies: companies.map((company) => {
      const activeWorkerCount = company.workers.filter((worker) => {
        const joiningDate = dateOnly(worker.joiningDate);
        const leavingDate = dateOnly(worker.leavingDate);

        // Not yet joined in this month.
        if (joiningDate && joiningDate >= nextMonthStart) {
          return false;
        }

        // A worker remains active throughout their leaving month.
        if (leavingDate && leavingDate < monthStart) {
          return false;
        }

        return true;
      }).length;

      return {
        id: company.id,
        code: company.code,
        name: company.name,
        workerCount: company._count.workers,
        activeWorkerCount,
        createdAt: company.createdAt,
      };
    }),
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
