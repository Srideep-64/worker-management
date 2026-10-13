const workCache = new Map();

export function getWorkCacheKey(workerId, month) {
  return `${workerId}:${month}`;
}

export function getCachedWork(workerId, month) {
  return workCache.get(getWorkCacheKey(workerId, month)) ?? null;
}

export function setCachedWork(workerId, month, data) {
  workCache.set(getWorkCacheKey(workerId, month), data);
}

export function invalidateCachedWork(workerId, month) {
  if (workerId && month) {
    workCache.delete(getWorkCacheKey(workerId, month));
  } else if (workerId) {
    const prefix = `${workerId}:`;
    for (const key of workCache.keys()) {
      if (key.startsWith(prefix)) workCache.delete(key);
    }
  } else {
    workCache.clear();
  }
}