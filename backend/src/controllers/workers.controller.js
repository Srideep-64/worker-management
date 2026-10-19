
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { createWorkerSchema, listWorkersQuerySchema, updateWorkerSchema } from "../../schemas/workers.schemas.js";
import {
  currentUaeMonthString,
  dateOnly,
} from "../utils/dates.js";
import { getWorkerStatus,getWorkerStatusForMonth } from "../utils/workerStatus.js";

function withWorkerStatus(worker) {
  return {
    ...worker,
    status: getWorkerStatus(worker),
  };
}

export const listWorkers = asyncHandler(async (req, res) => {
  const {
    search,
    companyId,
    status,
    month,
    page,
    limit,
  } = listWorkersQuerySchema.parse(req.query);

  const reportingMonth =
    month || currentUaeMonthString();

  const where = {};

  if (companyId) {
    where.companyId = companyId;
  }

  if (search) {
    where.OR = [
      {
        workerCode: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        name: {
          contains: search,
          mode: "insensitive",
        },
      },
    ];
  }

  const allWorkers = await prisma.worker.findMany({
    where,
    orderBy: [
      { name: "asc" },
      { workerCode: "asc" },
    ],
    select: {
      id: true,
      workerCode: true,
      name: true,
      jobTitle: true,
      nationality: true,
      joiningDate: true,
      leavingDate: true,
      company: {
        select: {
          id: true,
          name: true,
          code:true,
        },
      },
    },
  });

  const workersWithStatus = allWorkers.map((worker) => ({
    ...worker,
    status: getWorkerStatusForMonth(worker, reportingMonth),
  }));

  const filteredWorkers =
    status === "ALL"
      ? workersWithStatus
      : workersWithStatus.filter(
          (worker) => worker.status === status,
        );

  const total = filteredWorkers.length;
  const skip = (page - 1) * limit;

  res.json({
    workers: filteredWorkers.slice(skip, skip + limit),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});


export const getWorker = asyncHandler(async (req, res) => {
  const worker = await prisma.worker.findUnique({
    where: { id: req.params.id },
    include: {
      company: true,
    },
  });

  if (!worker) {
    throw new ApiError(404, "Worker not found");
  }

  const latestWorkRecord = await prisma.workRecord.findFirst({
    where: {
      workerId: req.params.id,
    },
    orderBy: {
      workDate: "desc",
    },
    select: {
      workDate: true,
    },
  });

  res.json({
    worker: {
      ...withWorkerStatus(worker),
      latestWorkDate: dateOnly(latestWorkRecord?.workDate),
    },
  });
});


export const createWorker = asyncHandler(async (req, res) => {
  const data = createWorkerSchema.parse(req.body);

  const company = await prisma.company.findUnique({
    where: { id: data.companyId },
    select: { id: true },
  });

  if (!company) {
    throw new ApiError(404, "Company not found");
  }

  const worker = await prisma.worker.create({
    data,
    include: {
      company: true,
    },
  });

  res.status(201).json({
    worker: withWorkerStatus(worker),
  });
});


export const updateWorker = asyncHandler(async (req, res) => {
  const data = updateWorkerSchema.parse(req.body);

  const existingWorker = await prisma.worker.findUnique({
    where: { id: req.params.id },
    select: { id: true },
  });

  if (!existingWorker) {
    throw new ApiError(404, "Worker not found");
  }

  // Reject a leaving date if any work record exists after it.
  // This checks both manual attendance and uploaded timesheets.
  if (data.leavingDate) {
    const laterWorkRecord = await prisma.workRecord.findFirst({
      where: {
        workerId: req.params.id,
        workDate: {
          gt: data.leavingDate,
        },
      },
      orderBy: {
        workDate: "asc",
      },
      select: {
        workDate: true,
      },
    });

    if (laterWorkRecord) {
      throw ApiError.badRequest(
        `Leaving date cannot be earlier than an existing work record (${dateOnly(laterWorkRecord.workDate)}).`,
      );
    }
  }

  // A null leavingDate clears the leaving date.
  const worker = await prisma.worker.update({
    where: { id: req.params.id },
    data,
    include: {
      company: true,
    },
  });

  res.json({
    worker: withWorkerStatus(worker),
  });
});
