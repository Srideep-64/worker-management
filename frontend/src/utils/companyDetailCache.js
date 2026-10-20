
const companyDetailsCache = new Map();
const companyWorkersCache = new Map();

// Company details
export function getCachedCompanyDetails(companyId) {
  return companyDetailsCache.get(companyId) ?? null;
}

export function setCachedCompanyDetails(companyId, data) {
  companyDetailsCache.set(companyId, data);
}

export function invalidateCompanyDetails(companyId) {
  if (companyId) {
    companyDetailsCache.delete(companyId);
  } else {
    companyDetailsCache.clear();
  }
}

// Paginated workers list, cached separately by company, month,
// status filter, page, and page size.
function getWorkersCacheKey(
  companyId,
  page,
  pageSize,
  status = "ACTIVE",
  month = ""
) {
  return `${companyId}:${month}:${status}:${page}:${pageSize}`;
}

export function getCachedCompanyWorkers(
  companyId,
  page,
  pageSize,
  status = "ACTIVE",
  month = ""
) {
  return (
    companyWorkersCache.get(
      getWorkersCacheKey(companyId, page, pageSize, status, month)
    ) ?? null
  );
}

export function setCachedCompanyWorkers(
  companyId,
  page,
  pageSize,
  data,
  status = "ACTIVE",
  month = ""
) {
  companyWorkersCache.set(
    getWorkersCacheKey(companyId, page, pageSize, status, month),
    data
  );
}

export function invalidateCompanyWorkers(companyId) {
  if (!companyId) {
    companyWorkersCache.clear();
    return;
  }

  const prefix = `${companyId}:`;

  for (const key of companyWorkersCache.keys()) {
    if (key.startsWith(prefix)) {
      companyWorkersCache.delete(key);
    }
  }
}

// Invalidate both caches for one company.
export function invalidateCompanyDetailCache(companyId) {
  invalidateCompanyDetails(companyId);
  invalidateCompanyWorkers(companyId);
}

export function updateCachedWorkerSummary(
  companyId,
  workerId,
  month,
  summary,
) {
  if (!companyId || !workerId || !month || !summary) return;

  const prefix = `${companyId}:${month}:`;

  for (const [key, data] of companyWorkersCache.entries()) {
    if (!key.startsWith(prefix) || !Array.isArray(data?.workers)) {
      continue;
    }

    if (!data.workers.some((worker) => worker.id === workerId)) {
      continue;
    }

    companyWorkersCache.set(key, {
      ...data,
      workers: data.workers.map((worker) =>
        worker.id === workerId
          ? {
              ...worker,
              totalHours: summary.totalHours,
              absentDays: summary.absentDays,
            }
          : worker,
      ),
    });
  }
}
