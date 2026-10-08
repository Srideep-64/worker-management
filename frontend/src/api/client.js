
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

// Centralized fetch handler
async function request(
  path,
  { method = "GET", body, headers, ...rest } = {}
) {
  const isFormData = body instanceof FormData;

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
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

  const contentType = response.headers.get("content-type") || "";

  const payload = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : null;

  if (!response.ok) {
    throw new ApiError(
      payload?.message ||
        `Request failed with status ${response.status}`,
      response.status,
      payload?.errors
    );
  }

  return payload;
}

// API methods
export const api = {
  get: (path) => request(path),

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