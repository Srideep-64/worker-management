
import { prisma } from "../lib/prisma.js";
import { ApiError } from "./ApiError.js";
import {
  dateOnly,
  getMonthStart,
  getUaeCalendarDates,
} from "./dates.js";

/* Shared relation selection */

export const RECORD_INCLUDE = {
  role: {
    select: { id: true, code: true, name: true },
  },
  upload: {
    select: { id: true, originalFilename: true, status: true },
  },
};

/* Attendance date validation */

export function assertWorkDateNotInFuture(workDate) {
  const requestedWorkDate = dateOnly(workDate);
  const { today } = getUaeCalendarDates();

  if (!requestedWorkDate) {
    throw ApiError.badRequest("Invalid work date.");
  }

  if (requestedWorkDate > today) {
    throw ApiError.badRequest(
      `Cannot add or edit attendance for a future date (${requestedWorkDate}). Today is ${today} in UAE time.`,
    );
  }
}

export function assertWorkDateWithinEmployment(worker, workDate) {
  const joiningDate = dateOnly(worker.joiningDate);
  const leavingDate = dateOnly(worker.leavingDate);
  const requestedWorkDate = dateOnly(workDate);

  if (!requestedWorkDate) {
    throw ApiError.badRequest("Invalid work date.");
  }

  if (joiningDate && requestedWorkDate < joiningDate) {
    throw ApiError.badRequest(
      `Cannot add or edit a work record dated ${requestedWorkDate}. The worker's joining date is ${joiningDate}.`,
    );
  }

  if (leavingDate && requestedWorkDate > leavingDate) {
    throw ApiError.badRequest(
      `Cannot add or edit a work record dated ${requestedWorkDate}. The worker's leaving date is ${leavingDate}.`,
    );
  }
}

export function validateWorkStatus({ status, hours }) {
  if (status === "WORKED" && hours == null) {
    throw ApiError.badRequest(
      "Hours are required when status is WORKED",
    );
  }

  if (status !== "WORKED" && hours != null) {
    throw ApiError.badRequest(
      "Hours must be omitted for non-WORKED statuses",
    );
  }
}

/* Active timesheet validation */
export async function assertNoActiveTimesheet(
  companyId,
  workDate,
  action,
  db = prisma,
) {
  const monthStart = getMonthStart(workDate);

  const activeTimesheet = await db.timesheetUpload.findFirst({
    where: {
      companyId,
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
      `This month is managed by an active timesheet. Manual records cannot be ${action}.`,
    );
  }
}

/* Record serialization */
export function serializeRecord(record) {
  return {
    id: record.id,
    date: dateOnly(record.workDate),
    status: record.status,
    hours: record.hours == null ? null : Number(record.hours),
    source: record.source,
    role: record.role,
    upload: record.upload,
  };
}

/* Attendance summary */
export function summarize(records) {
  const summary = {
    totalHours: 0,
    workedDays: 0,
    absentDays: 0,
    holidays: 0,
    weeklyOffs: 0,
    byRole: {},
  };

  for (const record of records) {
    if (record.status === "WORKED") {
      const hours = record.hours ?? 0;

      summary.workedDays += 1;
      summary.totalHours += hours;

      const role = `${record.role.code} — ${record.role.name}`;

      summary.byRole[role] =
        (summary.byRole[role] || 0) + hours;
    } else if (record.status === "ABSENT") {
      summary.absentDays += 1;
    } else if (record.status === "HOLIDAY") {
      summary.holidays += 1;
    } else if (record.status === "WEEKLY_OFF") {
      summary.weeklyOffs += 1;
    }
  }

  const list = (items) =>
    Object.entries(items)
      .map(([name, hours]) => ({ name, hours }))
      .sort((a, b) => b.hours - a.hours);

  return {
    ...summary,
    byRole: list(summary.byRole),
  };
}
