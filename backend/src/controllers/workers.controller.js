
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { createWorkerSchema, listWorkersQuerySchema, updateWorkerSchema } from "../../schemas/workers.schemas.js";
import {
  currentUaeMonthString,
  dateOnly,
  monthRange,
} from "../utils/dates.js";
import { getWorkerStatus,getWorkerStatusForMonth } from "../utils/workerStatus.js";
import { logActivity } from "../lib/activityLog.js";

const WORKER_FIELDS = {
  name: "name", companyId: "company", passportNumber: "passport number",
  passportExpiry: "passport expiry", nationality: "nationality",
  dateOfBirth: "date of birth", phone: "phone", visaNumber: "visa number",
  visaExpiry: "visa expiry", emiratesIdNumber: "Emirates ID number",
  emiratesIdExpiry: "Emirates ID expiry", labourCardNumber: "labour card number",
  jobTitle: "job title", joiningDate: "joining date", leavingDate: "leaving date",
};
const HIDE_VALUES = new Set([
  "passportNumber", "visaNumber", "emiratesIdNumber", "labourCardNumber",
  "phone", "dateOfBirth", "companyId",
]);

const norm = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : (v ?? null));

function diffWorker(before, data) {
  const changes = [];
  for (const key of Object.keys(WORKER_FIELDS)) {
    if (data[key] === undefined) continue;
    const from = norm(before[key]);
    const to = norm(data[key]);
    if (from !== to) changes.push({ key, from, to });
  }
  return changes;
}

function describeChanges(changes) {
  return changes
    .map(({ key, from, to }) =>
      HIDE_VALUES.has(key)
        ? `${WORKER_FIELDS[key]} updated`
        : `${WORKER_FIELDS[key]} ${from ?? "empty"} → ${to ?? "empty"}`)
    .join("; ");
}

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

  const reportingMonth = month || currentUaeMonthString();
  const { start, end } = monthRange(reportingMonth);

  const where = {};
  const conditions = [];

  if (companyId) {
    where.companyId = companyId;
  }

  if (search) {
    conditions.push({
      OR: [
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
      ],
    });
  }

  // Filter employment status in the database before pagination.
  if (status === "ACTIVE") {
    conditions.push(
      { joiningDate: { lt: end } },
      {
        OR: [
          { leavingDate: null },
          { leavingDate: { gte: start } },
        ],
      },
    );
  } else if (status === "INACTIVE") {
    conditions.push({
      OR: [
        { joiningDate: { gte: end } },
        { leavingDate: { lt: start } },
      ],
    });
  }

  if (conditions.length > 0) {
    where.AND = conditions;
  }

  const skip = (page - 1) * limit;

  // Fetch only the requested page and the total count.
  const [pageWorkers, total] = await Promise.all([
    prisma.worker.findMany({
      where,
      orderBy: [
        { name: "asc" },
        { workerCode: "asc" },
      ],
      skip,
      take: limit,
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
            code: true,
          },
        },
      },
    }),

    prisma.worker.count({ where }),
  ]);

  const workerIds = pageWorkers.map((worker) => worker.id);

  // Aggregate only the selected workers' records for this month.
  const attendanceGroups = workerIds.length
    ? await prisma.workRecord.groupBy({
        by: ["workerId", "status"],
        where: {
          workerId: { in: workerIds },
          workDate: { gte: start, lt: end },
        },
        _sum: {
          hours: true,
        },
        _count: {
          _all: true,
        },
      })
    : [];

  const attendanceByWorker = new Map(
    pageWorkers.map((worker) => [
      worker.id,
      { totalHours: 0, absentDays: 0 },
    ]),
  );

  for (const group of attendanceGroups) {
    const summary = attendanceByWorker.get(group.workerId);

    if (!summary) continue;

    if (group.status === "WORKED") {
      summary.totalHours += Number(group._sum.hours ?? 0);
    }

    if (group.status === "ABSENT") {
      summary.absentDays += group._count._all;
    }
  }

  const workers = pageWorkers.map((worker) => ({
    ...worker,
    status: getWorkerStatusForMonth(worker, reportingMonth),
    totalHours: attendanceByWorker.get(worker.id).totalHours,
    absentDays: attendanceByWorker.get(worker.id).absentDays,
  }));

  res.json({
    workers,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: skip + workers.length < total,
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

async function generateWorkerCode(tx, companyId) {
  const company = await tx.company.findUnique({
    where: {
      id: companyId,
    },
    select: {
      id: true,
      code: true,
    },
  });

  if (!company) {
    throw new ApiError(404, "Company not found");
  }

  const workers = await tx.worker.findMany({
    where: {
      companyId: company.id,
    },
    select: {
      workerCode: true,
    },
  });

  let maxNumber = 0;

  for (const worker of workers) {
    const match = worker.workerCode.match(
      /^([A-Z]{2,4})(\d{3,6})$/,
    );

    if (!match) {
      continue;
    }

    const [, prefix, number] = match;

    // Only consider IDs belonging to this company.
    if (prefix !== company.code) {
      continue;
    }

    maxNumber = Math.max(maxNumber, Number(number));
  }

  const nextNumber = String(maxNumber + 1).padStart(3, "0");

  const workerCode = `${company.code}${nextNumber}`;

  return {
    company,
    workerCode,
  };
}

export const createWorker = asyncHandler(async (req, res) => {
  const data = createWorkerSchema.parse(req.body);

  const worker = await prisma.$transaction(async (tx) => {
    // Serialize worker ID generation for the same company.
    // Different companies can still create workers independently.
    
    await tx.$queryRaw`
      WITH lock_result AS (
        SELECT pg_advisory_xact_lock(
          hashtextextended(${data.companyId}, 0)
        )
      )
      SELECT 1 AS locked
    `;


    const { company, workerCode } = await generateWorkerCode(
      tx,
      data.companyId,
    );

    const createdWorker = await tx.worker.create({
      data: {
        ...data,
        workerCode,
      },
      include: {
        company: true,
      },
    });

    return createdWorker;
  });

  await logActivity({
    user: req.user,
    category: "WORKERS",
    action: "CREATE",
    description: `Created worker ${worker.workerCode} (${worker.name}) at ${worker.company.name}`,
    workerId: worker.id,
    workerCode: worker.workerCode,
    companyId: worker.companyId,
    entityType: "Worker",
    entityId: worker.id,
  });

  res.status(201).json({
    worker: withWorkerStatus(worker),
  });
});

export const updateWorker = asyncHandler(async (req, res) => {
  const data = updateWorkerSchema.parse(req.body);

  const existingWorker = await prisma.worker.findUnique({
    where: { id: req.params.id },
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

    const changes = diffWorker(existingWorker, data);
  if (changes.length > 0) {
    await logActivity({
      user: req.user,
      category: "WORKERS",
      action: "UPDATE",
      description: `Updated worker ${worker.workerCode} (${worker.name}) — ${describeChanges(changes)}`,
      workerId: worker.id,
      workerCode: worker.workerCode,
      companyId: worker.companyId,
      entityType: "Worker",
      entityId: worker.id,
      metadata: {
        changes: changes.map(({ key, from, to }) =>
          HIDE_VALUES.has(key) ? { field: key } : { field: key, from, to }),
      },
    });
  }

  res.json({
    worker: withWorkerStatus(worker),
  });
});
