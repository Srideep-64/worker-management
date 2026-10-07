import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export function signSessionToken(user) {
  // Keep the payload minimal — it's not encrypted, only signed, so nothing
  // sensitive (password hash, documents, etc.) belongs in it.
  return jwt.sign({ sub: user.id }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
}

export function verifySessionToken(token) {
  return jwt.verify(token, env.JWT_SECRET); // throws on invalid/expired
}
