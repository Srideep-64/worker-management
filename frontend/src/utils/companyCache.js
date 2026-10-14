
const workerSummaryCache = new Map();
const monthlyStatsCache = new Map();

export function getWorkerSummary(key) {
  return workerSummaryCache.get(key) ?? null;
}

export function setWorkerSummary(key, value) {
  workerSummaryCache.set(key, value);
}


export function invalidateWorkerSummaries(companyId, month, workerId) {
  if (!companyId || !month) return;

  const prefix = `${companyId}:${month}:`;

  for (const key of workerSummaryCache.keys()) {
    if (!key.startsWith(prefix)) continue;

    // If a worker ID is provided, invalidate only that worker.
    if (workerId && key !== `${prefix}${workerId}`) continue;

    workerSummaryCache.delete(key);
  }
}


export function getMonthlyStats(key) {
  return monthlyStatsCache.get(key) ?? null;
}

export function setMonthlyStats(key, value) {
  monthlyStatsCache.set(key, value);
}

export function invalidateMonthlyStats(companyId, month) {
  if (companyId && month) {
    monthlyStatsCache.delete(`${companyId}:${month}`);
  } else if (companyId) {
    const prefix = `${companyId}:`;

    for (const key of monthlyStatsCache.keys()) {
      if (key.startsWith(prefix)) {
        monthlyStatsCache.delete(key);
      }
    }
  } else {
    monthlyStatsCache.clear();
  }
}
