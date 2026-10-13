
const rolesCache = new Map();
const payrollCache = new Map();

export function getCachedRoles() {
  return rolesCache.get("roles") ?? null;
}

export function setCachedRoles(data) {
  rolesCache.set("roles", data);
}

export function invalidateCachedRoles() {
  rolesCache.delete("roles");
}

function payrollKey(workerId, month) {
  return `${workerId}:${month}`;
}

export function getCachedPayroll(workerId, month) {
  return payrollCache.get(payrollKey(workerId, month)) ?? null;
}

export function setCachedPayroll(workerId, month, data) {
  payrollCache.set(payrollKey(workerId, month), data);
}

export function invalidateCachedPayroll(workerId, month) {
  payrollCache.delete(payrollKey(workerId, month));
}
const workerProfileCache = new Map();

export function getCachedWorkerProfile(workerId) {
  return workerProfileCache.get(workerId) ?? null;
}

export function setCachedWorkerProfile(workerId, data) {
  workerProfileCache.set(workerId, data);
}

export function invalidateWorkerProfile(workerId) {
  workerProfileCache.delete(workerId);
}
const workerDocumentsCache = new Map();

export function getCachedWorkerDocuments(workerId) {
  return workerDocumentsCache.get(workerId) ?? null;
}

export function setCachedWorkerDocuments(workerId, data) {
  workerDocumentsCache.set(workerId, data);
}

export function invalidateWorkerDocuments(workerId) {
  workerDocumentsCache.delete(workerId);
}