const companiesCache = new Map();
const timesheetsCache = new Map();

function cachedRequest(cache, key, fetcher) {
  if (cache.has(key)) {
    return cache.get(key);
  }

  const request = Promise.resolve()
    .then(fetcher)
    .catch((error) => {
      // Failed requests should be retryable.
      if (cache.get(key) === request) {
        cache.delete(key);
      }

      throw error;
    });

  cache.set(key, request);
  return request;
}

export function getCachedCompanies(fetcher) {
  return cachedRequest(companiesCache, "companies", fetcher);
}

export function getCachedTimesheets(key, fetcher) {
  return cachedRequest(timesheetsCache, key, fetcher);
}

export function invalidateTimesheetCaches() {
  companiesCache.clear();
  timesheetsCache.clear();
}