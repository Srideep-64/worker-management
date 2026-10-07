import { ApiError } from "../utils/ApiError.js";

export function notFound(req, res, next) {
  next(ApiError.notFound(`No route for ${req.method} ${req.originalUrl}`));
}
