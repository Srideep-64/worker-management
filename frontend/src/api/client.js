
/**
 * Thin wrapper around fetch for talking to the Express API.
 *
 * Authentication:
 * - Backend sets a secure, httpOnly cookie on login.
 * - Frontend never stores or accesses authentication tokens.
 * - Every request includes credentials: "include".
 *
 * Development:
 * - Vite proxies /api to the backend.
 * - API paths remain relative across environments.
 */

const BASE_URL = "/api";

// Share identical GET requests while they are in flight.
const inFlightGets = new Map();

// Custom API error
export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

// Build query strings from an object
export function qs(params = {}) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
      searchParams.set(key, String(value).trim());
    }
  });

  const query = searchParams.toString();

  return query ? `?${query}` : "";
}

// ── Response cache ─────────────────────────────────────────────
const cache = new Map(); // path -> { data, expires }
let version = 0;         // bumped on every invalidate

// First matching rule wins; anything unmatched uses DEFAULT_TTL.
const TTL_RULES = [
  [/^\/(me|auth)/, 0],                             // never cache the session
  [/^\/roles/, Infinity],                          // session-long
  [/\/(work|payroll|stats|dashboard)(\/|\?|$)/, 60_000],     // 1 min
];
const DEFAULT_TTL = 120_000;                       // 2 min
const ttlFor = (path) =>
  TTL_RULES.find(([re]) => re.test(path))?.[1] ?? DEFAULT_TTL;

async function cachedGet(path, { force = false } = {}) {
  const hit = cache.get(path);
  if (!force && hit && hit.expires > Date.now()) return hit.data;

  const startVersion = version;
  const data = await request(path);

  // Skip the write if an invalidate ran while this request was in flight.
  if (startVersion === version) {
    cache.set(path, { data, expires: Date.now() + ttlFor(path) });
  }
  return data;
}

export function invalidate(...parts) {
  version++;
  // Also drop matching in-flight GETs, otherwise a fetch started right
  // after invalidate would join the old (stale) request.
  for (const map of [cache, inFlightGets])
    for (const key of map.keys())
      if (parts.some((p) => key.includes(p))) map.delete(key);
}

export function clearCache() {   // call on logout
  version++;
  cache.clear();
  inFlightGets.clear();
}

// Centralized fetch handler
async function request(
  path,
  { method = "GET", body, headers, ...rest } = {}
) {
  const isFormData = body instanceof FormData;
  const url = `${BASE_URL}${path}`;
  const normalizedMethod = method.toUpperCase();

  // Deduplicate only GET requests without custom options that could
  // change the response. Other methods always execute independently.
  const canDeduplicate =
    normalizedMethod === "GET" &&
    !body &&
    !headers &&
    Object.keys(rest).length === 0;

  if (canDeduplicate && inFlightGets.has(url)) {
    return inFlightGets.get(url);
  }

  const fetchPromise = (async () => {
    const response = await fetch(url, {
      method: normalizedMethod,
      credentials: "include",

      headers: {
        ...(isFormData
          ? {}
          : { "Content-Type": "application/json" }),
        ...headers,
      },

      body: body
        ? isFormData
          ? body
          : JSON.stringify(body)
        : undefined,

      ...rest,
    });

    const contentType =
      response.headers.get("content-type") || "";

    const payload = contentType.includes("application/json")
      ? await response.json().catch(() => null)
      : null;

    if (!response.ok) {
  throw new ApiError(
    payload?.error?.message ||
      payload?.message ||
      `Request failed with status ${response.status}`,
    response.status,
    payload?.error?.details || payload?.errors
  );
}

    return payload;
  })();

  if (canDeduplicate) {
    inFlightGets.set(url, fetchPromise);

    try {
      return await fetchPromise;
    } finally {
      // Do not remove a newer request accidentally.
      if (inFlightGets.get(url) === fetchPromise) {
        inFlightGets.delete(url);
      }
    }
  }

  return fetchPromise;
}

// API methods
export const api = {
  get: cachedGet,

  post: (path, body) =>
    request(path, {
      method: "POST",
      body,
    }),

  put: (path, body) =>
    request(path, {
      method: "PUT",
      body,
    }),

  patch: (path, body) =>
    request(path, {
      method: "PATCH",
      body,
    }),

  delete: (path) =>
    request(path, {
      method: "DELETE",
    }),
};