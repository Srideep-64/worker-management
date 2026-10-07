// Mirrors the shape the frontend's `ApiError` (src/api/client.js) expects to
// unwrap: { error: { message, code?, details? } }.
export class ApiError extends Error {
  constructor(statusCode, message, { code, details } = {}) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  static badRequest(message, details) {
    return new ApiError(400, message, { code: "BAD_REQUEST", details });
  }

  static unauthorized(message = "Authentication required") {
    return new ApiError(401, message, { code: "UNAUTHORIZED" });
  }

  static forbidden(message = "Not allowed") {
    return new ApiError(403, message, { code: "FORBIDDEN" });
  }

  static notFound(message = "Not found") {
    return new ApiError(404, message, { code: "NOT_FOUND" });
  }

  static conflict(message, details) {
    return new ApiError(409, message, { code: "CONFLICT", details });
  }
}
