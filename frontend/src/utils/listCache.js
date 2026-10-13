
const companiesCache = new Map();
const workersCache = new Map();

export function getCachedCompanies() {
  return companiesCache.get("companies") ?? null;
}

export function setCachedCompanies(data) {
  companiesCache.set("companies", data);
}

export function invalidateCachedCompanies() {
  companiesCache.clear();
}

export function getCachedWorkers(key) {
  return workersCache.get(key) ?? null;
}

export function setCachedWorkers(key, data) {
  workersCache.set(key, data);
}

export function invalidateCachedWorkers() {
  workersCache.clear();
}
