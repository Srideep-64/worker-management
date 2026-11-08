/** Authenticated API client with bounded, per-resource in-memory caching. */
const BASE_URL = "/api";
const cache = new Map();
const inFlightGets = new Map();
const generations = new Map();
const MAX_ENTRIES = 250;
let sessionEpoch = 0;

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

export function qs(params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      query.set(key, String(value).trim());
    }
  }
  const text = query.toString();
  return text ? `?${text}` : "";
}

const TTL_RULES = [
  [/^\/(?:me|auth)(?:\/|\?|$)/, 0],
  [/^\/logs\/summary(?:\?|$)/, 120_000],
  [/^\/logs\/users(?:\?|$)/, Infinity],
  [/^\/logs(?:\/|\?|$)/, 0],
  [/^\/roles(?:\/|\?|$)/, Infinity],
  [/^\/dashboard(?:\/|\?|$)/, 60_000],
  [/^\/workers\/[^/?]+\/(?:work|payroll)(?:\/|\?|$)/, 60_000],
  [/^\/companies\/[^/?]+\/stats(?:\/|\?|$)/, 60_000],
];
const DEFAULT_TTL = 120_000;
const ttlFor = (path) => TTL_RULES.find(([rule]) => rule.test(path))?.[1] ?? DEFAULT_TTL;
const currentGeneration = (path) => generations.get(path) ?? 0;

// A bounded cache; entries are session-only and never stored in localStorage.
function putCache(path, data) {
  const ttl = ttlFor(path);
  if (ttl === 0) return;
  cache.delete(path);
  cache.set(path, { data, expires: ttl === Infinity ? Infinity : Date.now() + ttl });
  while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value);
}

// Returns stale data too, for instant initial rendering while revalidating.
export function peekCache(path) {
  const entry = cache.get(path);
  return entry ? { data: entry.data, fresh: entry.expires > Date.now() } : null;
}

async function request(path, { method = "GET", body, headers, ...rest } = {}) {
  const normalizedMethod = method.toUpperCase();
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  const isGet = normalizedMethod === "GET";
  const canDedupe = isGet && body == null && !headers && Object.keys(rest).length === 0;
  const url = `${BASE_URL}${path}`;
  const generation = currentGeneration(path);
  const epoch = sessionEpoch;
  const existing = inFlightGets.get(url);
  if (canDedupe && existing && existing.generation === generation && existing.epoch === epoch) {
    return existing.promise;
  }

  const promise = (async () => {
    const response = await fetch(url, {
      method: normalizedMethod,
      credentials: "include",
      headers: { ...(isFormData ? {} : { "Content-Type": "application/json" }), ...headers },
      body: body == null ? undefined : isFormData ? body : JSON.stringify(body),
      ...rest,
    });
    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
      ? await response.json().catch(() => null)
      : null;
    // A pre-logout/pre-login response must never populate the new user's UI.
    if (isGet && epoch !== sessionEpoch) {
      throw new ApiError("Session changed. Please retry.", 0);
    }
    if (!response.ok) {
      throw new ApiError(
        payload?.error?.message || payload?.message || `Request failed with status ${response.status}`,
        response.status,
        payload?.error?.details || payload?.errors,
      );
    }
    return payload;
  })();

  if (canDedupe) {
    inFlightGets.set(url, { promise, generation, epoch });
    try { return await promise; }
    finally {
      if (inFlightGets.get(url)?.promise === promise) inFlightGets.delete(url);
    }
  }
  return promise;
}

async function cachedGet(path, { force = false } = {}) {
  const hit = cache.get(path);
  if (!force && hit && hit.expires > Date.now()) return hit.data;
  const generation = currentGeneration(path);
  const epoch = sessionEpoch;
  const data = await request(path);
  if (generation === currentGeneration(path) && epoch === sessionEpoch) putCache(path, data);
  return data;
}

/** Invalidate URL fragments, without affecting unrelated concurrent GETs. */
export function invalidate(...parts) {
  const fragments = parts.filter((part) => typeof part === "string" && part.length);
  if (!fragments.length) return;
  const matching = (key) => fragments.some((part) => key.includes(part));
  const paths = new Set([
    ...cache.keys(),
    ...[...inFlightGets.keys()].map((url) => url.startsWith(BASE_URL) ? url.slice(BASE_URL.length) : url),
  ]);
  for (const path of paths) {
    if (!matching(path)) continue;
    generations.set(path, currentGeneration(path) + 1);
    cache.delete(path);
    inFlightGets.delete(`${BASE_URL}${path}`);
  }
}

export function clearCache() {
  sessionEpoch++;
  cache.clear();
  inFlightGets.clear();
  generations.clear();
}

async function mutation(method, path, body) {
  const result = await request(path, { method, body });
  // Every successful state-changing action may generate a new audit log.
  // Never invalidate other resource caches automatically: call sites know their dependencies.
  if (!path.startsWith("/auth/")) invalidate("/logs/summary", "/logs?");
  return result;
}

export const api = {
  get: cachedGet,
  peek: peekCache,
  post: (path, body) => mutation("POST", path, body),
  put: (path, body) => mutation("PUT", path, body),
  patch: (path, body) => mutation("PATCH", path, body),
  delete: (path) => mutation("DELETE", path),
};
