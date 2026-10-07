import jwt from "jsonwebtoken";
import { z } from "zod";
import { env, isProduction } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { normalizeEmail, verifyPassword } from "../utils/password.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days, matches JWT_EXPIRES_IN default

function cookieOptions() {
  return {
    httpOnly: true,
    secure: isProduction, // must be true in production (HTTPS); relaxed in local dev
    sameSite: isProduction ? "none" : "lax",
    maxAge: COOKIE_MAX_AGE_MS,
    path: "/",
  };
}

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({
    where: { email: normalizeEmail(email) },
  });

  // Deliberately identical error for "no such user" and "wrong password" so
  // the endpoint doesn't leak which emails have accounts.
  const invalidCredentials = () => ApiError.unauthorized("Invalid email or password");

  if (!user) {
    throw invalidCredentials();
  }

  const passwordValid = await verifyPassword(user.passwordHash, password);
  if (!passwordValid) {
    throw invalidCredentials();
  }

  const token = jwt.sign({ sub: user.id }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  });

  res.cookie(env.COOKIE_NAME, token, cookieOptions());
  res.json({ user: { id: user.id, name: user.name, email: user.email } });
});

export const logout = asyncHandler(async (req, res) => {
  res.clearCookie(env.COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });
  res.status(204).end();
});

export const me = asyncHandler(async (req, res) => {
  // req.user is set by requireAuth
  res.json({ user: req.user });
});
