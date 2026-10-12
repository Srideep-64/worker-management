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
  roleId: z.string().uuid(),
  workDate: z.coerce.date(),
  status: z.enum([
    "WORKED",
    "ABSENT",
    "HOLIDAY",
    "WEEKLY_OFF",
  ]),
  hours: z.coerce.number().gt(0).max(24).optional(),
});

export const updateManualWorkSchema = z.object({
  status: z.enum([
    "WORKED",
    "ABSENT",
    "HOLIDAY",
    "WEEKLY_OFF",
  ]),
  roleId: z.string().uuid().optional(),
  hours: z.coerce.number().gt(0).max(24).optional(),
});

// PATCH /api/workers/:id/work/:recordId
export const updateManualWork = asyncHandler(
  async (req, res) => {
    const { id: workerId, recordId } = req.params;
    const { status, roleId, hours } = req.body;

    const existing = await prisma.workRecord.findFirst({
      where: {
        id: recordId,
        workerId,
      },
      include: RECORD_INCLUDE,
    });

    if (!existing) {
      throw ApiError.notFound("Work record not found");
    }

    // Timesheet records must never be edited manually.
    if (existing.source !== "MANUAL" || existing.uploadId) {
      throw ApiError.badRequest(
        "Timesheet records cannot be edited. Update the source timesheet instead."
      );
    }

    if (status === "WORKED" && hours == null) {
      throw ApiError.badRequest(
        "Hours are required when status is WORKED"
      );
    }

    if (status !== "WORKED" && hours != null) {
      throw ApiError.badRequest(
        "Hours must be omitted for non-WORKED statuses"
      );
    }

    const worker = await prisma.worker.findUnique({
      where: { id: workerId },
      select: { id: true, companyId: true },
    });

    if (!worker) {
      throw ApiError.notFound("Worker not found");
    }

    const monthStart = new Date(
      Date.UTC(
        existing.workDate.getUTCFullYear(),
        existing.workDate.getUTCMonth(),
        1
      )
    );

    // Protect the monthly timesheet/manual-entry invariant.
    const activeTimesheet = await prisma.timesheetUpload.findFirst({
      where: {
        companyId: worker.companyId,
        periodMonth: monthStart,
        status: "ACTIVE",
      },
      select: { id: true },
    });

    if (activeTimesheet) {
      throw ApiError.conflict(
        "This month is managed by an active timesheet. Manual records cannot be edited."
      );
    }

    // Preserve the database role for non-WORKED statuses.
    // The UI will display the role as cleared for these statuses.
    const nextRoleId =
      status === "WORKED"
        ? roleId ?? existing.roleId
        : existing.roleId;

    if (status === "WORKED" && !nextRoleId) {
      throw ApiError.badRequest(
        "Select a role when status is WORKED"
      );
    }

    const role = await prisma.role.findUnique({
      where: { id: nextRoleId },
      select: { id: true },
    });

    if (!role) {
      throw ApiError.badRequest(
        "The selected role does not exist"
      );
    }

    const updated = await prisma.workRecord.update({
      where: { id: existing.id },
      data: {
        status,
        roleId: nextRoleId,
        hours: status === "WORKED" ? hours : null,
      },
      include: RECORD_INCLUDE,
    });

    res.json({
      record: {
        id: updated.id,
        date: updated.workDate.toISOString().slice(0, 10),
        status: updated.status,
        hours:
          updated.hours === null
            ? null
            : Number(updated.hours),
        source: updated.source,
        role: updated.role,
        upload: updated.upload,
      },
    });
  }
);

function summarize(records) {
  const s = {
    totalHours: 0,
    workedDays: 0,
    absentDays: 0,
    holidays: 0,
    weeklyOffs: 0,
    byRole: {},
  };

  for (const r of records) {
    if (r.status === "WORKED") {
      const h = r.hours ?? 0;

      s.workedDays += 1;
      s.totalHours += h;

      const role = `${r.role.code} — ${r.role.name}`;
      s.byRole[role] = (s.byRole[role] || 0) + h;

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
  };
}

const RECORD_INCLUDE = {
  role: {
    select: {
      id:true,
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

const rows = await prisma.workRecord.findMany({
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
});

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
    upload: r.upload,
  }));

  res.json({
    month,
    records,
    summary: summarize(records),
  });
});

// POST /api/workers/:id/work
export const createManualWork = asyncHandler(
  async (req, res) => {
    const workerId = req.params.id;

    const {
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

    const role = await prisma.role.findUnique({
      where: { id: roleId },
      select: { id: true },
    });

    if (!role) {
      throw ApiError.badRequest(
        "roleId does not reference an existing role"
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