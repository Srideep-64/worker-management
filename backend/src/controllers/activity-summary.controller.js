import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const MAX_GROUPS = 40;
const LOOKBACK_DAYS = 7;
const MAX_FETCH = 1500;
const TZ = "Asia/Dubai";
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

function uaeDay(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const get = (key) => parts.find((p) => p.type === key)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function metadataMonth(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  for (const field of ["payrollMonth", "workMonth", "reportMonth", "reportingMonth", "month"]) {
    const value = metadata[field];
    if (typeof value === "string") {
      const key = value.slice(0, 7);
      if (monthPattern.test(key) && (value.length === 7 || /^\d{4}-\d{2}-\d{2}/.test(value))) return key;
    }
  }
  return null;
}

function actionLabel(category, action) {
  const a = (action || "").toLowerCase().replace(/[_-]+/g, " ");
  if (category === "WORK_RECORDS") {
    if (/delet|remov/.test(a)) return "Work records deleted";
    if (/updat|edit|replac/.test(a)) return "Work records updated";
    if (/add|creat|insert/.test(a)) return "Work records added";
    return "Work records changed";
  }
  if (category === "PAYROLL") {
    if (/rate/.test(a)) return /delet|remov/.test(a) ? "Hourly rates removed" : "Hourly rates updated";
    if (/advance/.test(a)) return "Payroll advances updated";
    return "Payroll updated";
  }
  if (category === "TIMESHEETS") return "Timesheet activity";
  const categories = { WORKERS: "Worker", DOCUMENTS: "Document", COMPANIES: "Company" };
  const base = categories[category] || "Activity";
  if (/delet|remov/.test(a)) return `${base} deleted`;
  if (/add|creat/.test(a)) return `${base} added`;
  if (/updat|edit/.test(a)) return `${base} updated`;
  return `${base} activity`;
}

// GET /logs/summary — no schema changes required.
// Grouping uses structured columns and metadata, never parses free-form descriptions.
export const dashboardLogSummary = asyncHandler(async (req, res) => {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const logs = await prisma.activityLog.findMany({
    where: { createdAt: { gte: since } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: MAX_FETCH,
    select: {
      id: true, createdAt: true, category: true, action: true,
      description: true, userId: true, username: true,
      companyId: true, workerId: true, workerCode: true, metadata: true,
    },
  });

  const companyIds = [...new Set(logs.map((l) => l.companyId).filter(Boolean))];
  const companies = companyIds.length
    ? await prisma.company.findMany({
        where: { id: { in: companyIds } },
        select: { id: true, name: true, code: true },
      })
    : [];
  const companyById = new Map(companies.map((c) => [c.id, c]));

  const groups = new Map();
  for (const log of logs) {
    const day = uaeDay(log.createdAt);
    const reportMonth = metadataMonth(log.metadata);
    // No month metadata? Keep separate from month-known logs, never infer a month.
    const key = JSON.stringify([
      day, log.userId || log.username, log.companyId, log.category,
      log.action, reportMonth,
    ]);
    if (!groups.has(key)) {
      groups.set(key, {
        key, day, reportMonth, category: log.category, action: log.action,
        title: actionLabel(log.category, log.action),
        userId: log.userId, username: log.username || "Unknown",
        companyId: log.companyId, companyName: companyById.get(log.companyId)?.name || null,
        latestAt: log.createdAt, eventCount: 0, workers: new Map(),
        sampleDescription: log.description, id: log.id,
      });
    }
    const group = groups.get(key);
    group.eventCount += 1;
    if (log.workerId || log.workerCode) {
      const code = log.workerCode || (log.metadata && typeof log.metadata.workerCode === "string" ? log.metadata.workerCode : null);
      group.workers.set(log.workerId || code, code || "Worker");
    }
  }

  const result = [...groups.values()]
    .sort((a, b) => new Date(b.latestAt) - new Date(a.latestAt))
    .slice(0, MAX_GROUPS)
    .map(({ workers, ...g }) => ({
      ...g, workerCount: workers.size, workerCodes: [...workers.values()].slice(0, 3),
    }));

  res.json({ groups: result, lookbackDays: LOOKBACK_DAYS, truncated: logs.length === MAX_FETCH });
});
