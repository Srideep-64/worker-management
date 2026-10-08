import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Every route except POST /api/auth/login goes through this. It verifies the
// httpOnly session cookie, loads the current user, and attaches it to
// `req.user`. We re-fetch the user (rather than trusting the JWT payload
// alone) so a deleted/disabled account is rejected immediately rather than
// staying valid until the token expires.
export const requireAuth = asyncHandler(async (req, res, next) => {
  const token = req.cookies?.[env.COOKIE_NAME];

    console.log("AUTH DEBUG:", {
    hasCookie: Boolean(token),
    cookieName: env.COOKIE_NAME,
    origin: req.headers.origin,
    referer: req.headers.referer,
  });

  if (!token) {
    throw ApiError.unauthorized();
  }

  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET);
  } catch {
    throw ApiError.unauthorized("Session expired or invalid");
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, name: true, email: true },
  });

  if (!user) {
    throw ApiError.unauthorized();
  }

  req.user = user;
  next();
});
