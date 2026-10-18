import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  currentUaeMonthString,
  monthRange,
  dateOnly,
} from "../utils/dates.js";

export const createCompanySchema = z.object({
  code: z.string().trim().min(1).max(10),
  name: z.string().trim().min(1).max(200),
});


export const listCompanies = asyncHandler(async (req, res) => {
  // Use the current month in the UAE timezone.
const month = currentUaeMonthString();
const { start, end } = monthRange(month);

const monthStart = dateOnly(start);
const nextMonthStart = dateOnly(end);

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
