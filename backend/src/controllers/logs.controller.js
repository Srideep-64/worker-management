import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { cleanupOldLogs } from "../lib/activityLog.js";

const CATEGORIES = ["WORKERS", "WORK_RECORDS", "TIMESHEETS", "PAYROLL", "DOCUMENTS", "COMPANIES"];
const dayString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const idString = z.string().trim().min(1).max(100);

export const listLogsQuerySchema = z.object({
  category: z.enum(CATEGORIES).optional(),
  userId: idString.optional(),
  workerId: idString.optional(),
  companyId: idString.optional(),
  from: dayString.optional(),
  to: dayString.optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});

const uaeDayStart = (day) => new Date(`${day}T00:00:00+04:00`);

export const listLogs = asyncHandler(async (req, res) => {
  void cleanupOldLogs();

  const q = listLogsQuerySchema.parse(req.query);

  const where = {
    ...(q.category ? { category: q.category } : {}),
    ...(q.userId ? { userId: q.userId } : {}),
    ...(q.workerId ? { workerId: q.workerId } : {}),
    ...(q.companyId ? { companyId: q.companyId } : {}),
  };

  if (q.from || q.to) {
    where.createdAt = {};
    if (q.from) where.createdAt.gte = uaeDayStart(q.from);
    if (q.to) {
      const end = uaeDayStart(q.to);
      end.setUTCDate(end.getUTCDate() + 1);
      where.createdAt.lt = end;
    }
  }

  if (q.search) {
    // Match workers by name or code, then match logs about those workers.
    const matchingWorkers = await prisma.worker.findMany({
      where: {
        OR: [
          { name: { contains: q.search, mode: "insensitive" } },
          { workerCode: { contains: q.search, mode: "insensitive" } },
        ],
      },
      select: { id: true },
      take: 200,
    });

    where.OR = [
      { description: { contains: q.search, mode: "insensitive" } },
      { username: { contains: q.search, mode: "insensitive" } },
      { workerCode: { contains: q.search, mode: "insensitive" } },
      ...(matchingWorkers.length
        ? [{ workerId: { in: matchingWorkers.map((w) => w.id) } }]
        : []),
    ];
  }

  const [logs, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.activityLog.count({ where }),
  ]);

  // Attach each worker's current name (falls back to the name saved in metadata).
  const workerIds = [...new Set(logs.map((log) => log.workerId).filter(Boolean))];
  const workers = workerIds.length
    ? await prisma.worker.findMany({
        where: { id: { in: workerIds } },
        select: { id: true, name: true, workerCode: true },
      })
    : [];
  const workerById = new Map(workers.map((w) => [w.id, w]));

  res.json({
    logs: logs.map((log) => {
      const worker = log.workerId ? workerById.get(log.workerId) : null;
      return {
        ...log,
        username: log.username || "Unknown",
        workerName: worker?.name ?? log.metadata?.workerName ?? null,
        workerCode: worker?.workerCode ?? log.workerCode,
      };
    }),
    pagination: {
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.ceil(total / q.pageSize),
    },
  });
});

// For the "admin" filter dropdown.
export const listLogUsers = asyncHandler(async (req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  res.json({ users });
});