import { prisma } from "./prisma.js";

export const LOG_RETENTION_DAYS = 60;

let lastCleanupAt = 0;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Deletes logs older than 60 days. Runs at most once per day per server
// instance, triggered by normal app activity. Never throws.
export async function cleanupOldLogs() {
  const now = Date.now();
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
  lastCleanupAt = now;

  try {
    const cutoff = new Date(now - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const { count } = await prisma.activityLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    if (count > 0) {
      console.log(`Deleted ${count} activity logs older than ${LOG_RETENTION_DAYS} days`);
    }
  } catch (err) {
    lastCleanupAt = 0; // try again on the next trigger
    console.error("Activity log cleanup failed:", err);
  }
}

// Call this AFTER the operation has succeeded. A logging failure is printed
// but never breaks the request, because the real work is already saved.
export async function logActivity({
  user, category, action, description,
  workerId, workerCode, companyId, entityType, entityId, metadata,
}) {
  if (!user?.id) {
    console.warn(`[activityLog] No user passed for "${description}". Pass req.user from the controller.`);
  }

  try {
    await prisma.activityLog.create({
      data: {
        userId: user?.id ?? null,
        username: user?.name ?? "Unknown",
        category,
        action,
        description,
        workerId: workerId ?? null,
        workerCode: workerCode ?? null,
        companyId: companyId ?? null,
        entityType: entityType ?? null,
        entityId: entityId ?? null,
        metadata: metadata ?? undefined,
      },
    });

    void cleanupOldLogs();
  } catch (err) {
    console.error("Failed to write activity log:", err);
  }
}

export function monthLabel(month) {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "long", year: "numeric", timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}