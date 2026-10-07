import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  monthSchema,
  monthRange,
  currentMonthString,
} from "../utils/dates.js";

export const monthQuerySchema = z.object({
  month: monthSchema.optional(),
});

export const createManualWorkSchema = z.object({
  clientId: z.string().uuid(),
  roleId: z.string().uuid(),
  workDate: z.coerce.date(),
  status: z.enum([
    "WORKED",
    "ABSENT",
    "HOLIDAY",
    "WEEKLY_OFF",
  ]),
  hours: z.coerce.number().min(0).max(24).optional(),
});

function summarize(records) {
  const s = {
    totalHours: 0,
    workedDays: 0,
    absentDays: 0,
    holidays: 0,
    weeklyOffs: 0,
    byRole: {},
    byClient: {},
  };

  for (const r of records) {
    if (r.status === "WORKED") {
      const h = r.hours ?? 0;

      s.workedDays += 1;
      s.totalHours += h;

      const role = `${r.role.code} — ${r.role.name}`;
      s.byRole[role] = (s.byRole[role] || 0) + h;

      s.byClient[r.client.name] =
        (s.byClient[r.client.name] || 0) + h;
    } else if (r.status === "ABSENT") {
      s.absentDays += 1;
    } else if (r.status === "HOLIDAY") {
      s.holidays += 1;
    } else if (r.status === "WEEKLY_OFF") {
      s.weeklyOffs += 1;
    }
  }

  const list = (o) =>
    Object.entries(o)
      .map(([name, hours]) => ({ name, hours }))
      .sort((a, b) => b.hours - a.hours);

  return {
    ...s,
    byRole: list(s.byRole),
    byClient: list(s.byClient),
  };
}

const RECORD_INCLUDE = {
  role: {
    select: {
      code: true,
      name: true,
    },
  },

  client: {
    select: {
      id: true,
      code: true,
      name: true,
    },
  },

  upload: {
    select: {
      id: true,
      originalFilename: true,
      status: true,
    },
  },
};

// GET /api/workers/:id/work?month=YYYY-MM
export const getWorkerWork = asyncHandler(async (req, res) => {
  const worker = await prisma.worker.findUnique({
    where: {
      id: req.params.id,
    },
    select: {
      id: true,
    },
  });

  if (!worker) {
    throw ApiError.notFound("Worker not found");
  }

  const month =
    req.query.month || currentMonthString();

  const { start, end } = monthRange(month);

  const [rows, assignments] = await Promise.all([
    prisma.workRecord.findMany({
      where: {
        workerId: worker.id,
        workDate: {
          gte: start,
          lt: end,
        },
      },
      orderBy: {
        workDate: "asc",
      },
      include: RECORD_INCLUDE,
    }),

    prisma.workerAssignment.findMany({
      where: {
        workerId: worker.id,
        startDate: {
          lt: end,
        },
        OR: [
          {
            endDate: null,
          },
          {
            endDate: {
              gte: start,
            },
          },
        ],
      },
      include: {
        client: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
      orderBy: {
        startDate: "asc",
      },
    }),
  ]);

  const records = rows.map((r) => ({
    id: r.id,
    date: r.workDate.toISOString().slice(0, 10),
    status: r.status,
    hours:
      r.hours === null
        ? null
        : Number(r.hours),
    source: r.source,
    role: r.role,
    client: r.client,
    upload: r.upload,
  }));

  res.json({
    month,
    records,
    summary: summarize(records),

    assignments: assignments.map(
      (assignment) => ({
        id: assignment.id,
        client: assignment.client,
        startDate:
          assignment.startDate
            .toISOString()
            .slice(0, 10),
        endDate: assignment.endDate
          ? assignment.endDate
              .toISOString()
              .slice(0, 10)
          : null,
      })
    ),
  });
});

// POST /api/workers/:id/work
export const createManualWork = asyncHandler(
  async (req, res) => {
    const workerId = req.params.id;

    const {
      clientId,
      roleId,
      workDate,
      status,
      hours,
    } = req.body;

    const worker = await prisma.worker.findUnique({
      where: {
        id: workerId,
      },
      select: {
        id: true,
        companyId: true,
      },
    });

    if (!worker) {
      throw ApiError.notFound("Worker not found");
    }

    if (status === "WORKED" && hours == null) {
      throw ApiError.badRequest(
        "Hours are required when status is WORKED"
      );
    }

    if (status !== "WORKED" && hours != null) {
      throw ApiError.badRequest(
        "Hours should only be provided when status is WORKED"
      );
    }

    const monthStart = new Date(
      Date.UTC(
        workDate.getUTCFullYear(),
        workDate.getUTCMonth(),
        1
      )
    );

    const activeTimesheet =
      await prisma.timesheetUpload.findFirst({
        where: {
          companyId: worker.companyId,
          periodMonth: monthStart,
          status: "ACTIVE",
        },
        select: {
          id: true,
          originalFilename: true,
        },
      });

    if (activeTimesheet) {
      throw ApiError.conflict(
        "This month is managed by an active timesheet. Manual work cannot be added."
      );
    }

    const [client, role] = await Promise.all([
      prisma.client.findUnique({
        where: {
          id: clientId,
        },
        select: {
          id: true,
        },
      }),

      prisma.role.findUnique({
        where: {
          id: roleId,
        },
        select: {
          id: true,
        },
      }),
    ]);

    if (!client) {
      throw ApiError.badRequest(
        "clientId does not reference an existing client"
      );
    }

    if (!role) {
      throw ApiError.badRequest(
        "roleId does not reference an existing role"
      );
    }

    const assignment =
      await prisma.workerAssignment.findFirst({
        where: {
          workerId,
          clientId,
          startDate: {
            lte: workDate,
          },
          OR: [
            {
              endDate: null,
            },
            {
              endDate: {
                gte: workDate,
              },
            },
          ],
        },
        select: {
          id: true,
        },
      });

    if (!assignment) {
      throw ApiError.badRequest(
        "This worker is not assigned to the selected client on this date"
      );
    }

    const existing =
      await prisma.workRecord.findUnique({
        where: {
          workerId_workDate: {
            workerId,
            workDate,
          },
        },
        select: {
          id: true,
        },
      });

    if (existing) {
      throw ApiError.conflict(
        "A work record already exists for this worker on this date"
      );
    }

    const record =
      await prisma.workRecord.create({
        data: {
          workerId,
          clientId,
          roleId,
          workDate,
          status,
          hours:
            status === "WORKED"
              ? hours
              : null,
          source: "MANUAL",
          uploadId: null,
        },
        include: RECORD_INCLUDE,
      });

    res.status(201).json({
      record: {
        id: record.id,
        date: record.workDate
          .toISOString()
          .slice(0, 10),
        status: record.status,
        hours:
          record.hours === null
            ? null
            : Number(record.hours),
        source: record.source,
        role: record.role,
        client: record.client,
        upload: record.upload,
      },
    });
  }
);

// GET /api/companies/:id/stats?month=YYYY-MM
export const getCompanyStats = asyncHandler(
  async (req, res) => {
    const company =
      await prisma.company.findUnique({
        where: {
          id: req.params.id,
        },
        select: {
          id: true,
        },
      });

    if (!company) {
      throw ApiError.notFound("Company not found");
    }

    const month =
      req.query.month || currentMonthString();

    const { start, end } = monthRange(month);

    const [rows, activeUpload] =
      await Promise.all([
        prisma.workRecord.findMany({
          where: {
            worker: {
              companyId: company.id,
            },
            workDate: {
              gte: start,
              lt: end,
            },
          },
          select: {
            workerId: true,
            status: true,
            hours: true,
            role: {
              select: {
                code: true,
                name: true,
              },
            },
            client: {
              select: {
                name: true,
              },
            },
          },
        }),

        prisma.timesheetUpload.findFirst({
          where: {
            companyId: company.id,
            periodMonth: start,
            status: "ACTIVE",
          },
          select: {
            id: true,
            originalFilename: true,
            uploadedAt: true,
          },
        }),
      ]);

    const records = rows.map((r) => ({
      ...r,
      hours:
        r.hours === null
          ? null
          : Number(r.hours),
    }));

    res.json({
      month,
      activeUpload,
      workersWithRecords: new Set(
        rows.map((r) => r.workerId)
      ).size,
      summary: summarize(records),
    });
  }
);