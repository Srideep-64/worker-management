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

// Paginated workers list
function getWorkersCacheKey(companyId, page, pageSize) {
  return `${companyId}:${page}:${pageSize}`;
}

export function getCachedCompanyWorkers(companyId, page, pageSize) {
  return (
    companyWorkersCache.get(
      getWorkersCacheKey(companyId, page, pageSize)
    ) ?? null
  );
}

export function setCachedCompanyWorkers(
  companyId,
  page,
  pageSize,
  data
) {
  companyWorkersCache.set(
    getWorkersCacheKey(companyId, page, pageSize),
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

// Invalidate both caches for one company
export function invalidateCompanyDetailCache(companyId) {
  invalidateCompanyDetails(companyId);
  invalidateCompanyWorkers(companyId);
}
