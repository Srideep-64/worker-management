import pino from "pino";
import { isProduction } from "../config/env.js";

// Belt-and-braces redaction: even if a caller accidentally logs a whole
// request body or user record, these paths never make it to the log line.
// This list is deliberately broad — it's cheaper to redact a field that
// turns out to be harmless than to leak one that isn't.
const REDACT_PATHS = [
  "password",
  "passwordHash",
  "password_hash",
  "*.password",
  "*.passwordHash",
  "req.headers.cookie",
  "req.headers.authorization",
  "res.headers['set-cookie']",
  "passportNumber",
  "*.passportNumber",
  "visaNumber",
  "*.visaNumber",
  "emiratesIdNumber",
  "*.emiratesIdNumber",
  "labourCardNumber",
  "*.labourCardNumber",
  "storageKey",
  "*.storageKey",
  "documentUrl",
  "*.documentUrl",
];

export const logger = pino({
  level: isProduction ? "info" : "debug",
  redact: { paths: REDACT_PATHS, censor: "[redacted]" },
  transport: isProduction ? undefined : { target: "pino-pretty", options: { colorize: true } },
});
