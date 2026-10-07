import { ApiError } from "../utils/ApiError.js";

/**
 * Usage: router.post("/", validate({ body: someZodSchema }), handler)
 * Validates and REPLACES req.body/query/params with the parsed (and
 * type-coerced) result, so downstream code can trust their shape.
 */
export function validate(schemas) {
  return function validateMiddleware(req, res, next) {
    for (const key of ["body", "query", "params"]) {
      const schema = schemas[key];
      if (!schema) continue;

      const result = schema.safeParse(req[key]);
      if (!result.success) {
        throw ApiError.badRequest("Validation failed", result.error.flatten().fieldErrors);
      }
      req[key] = result.data;
    }
    next();
  };
}
