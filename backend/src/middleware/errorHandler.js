import { Prisma } from "@prisma/client";
import multer from "multer";
import { isProduction } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { message: "Route not found", code: "NOT_FOUND" } });
}

// Keep this LAST in the middleware chain (4-arg signature is what makes
// Express treat it as an error handler).
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      error: { message: err.message, code: err.code, details: err.details },
    });
  }

  if (err instanceof multer.MulterError) {
    const message = err.code === "LIMIT_FILE_SIZE" ? "File is too large (max 5MB)" : err.message;
    return res.status(400).json({ error: { message, code: "BAD_REQUEST" } });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return res.status(409).json({
        error: {
          message: `A record with this ${err.meta?.target?.join(", ") || "value"} already exists`,
          code: "CONFLICT",
        },
      });
    }
    if (err.code === "P2025") {
      return res.status(404).json({ error: { message: "Record not found", code: "NOT_FOUND" } });
    }
  }

  // Never log request bodies wholesale here — they may contain passwords or
  // document metadata. Log only the message/stack.
  console.error(err.message, isProduction ? "" : err.stack);

  return res.status(500).json({
    error: {
      message: isProduction ? "Something went wrong" : err.message,
      code: "INTERNAL_ERROR",
    },
  });
}
