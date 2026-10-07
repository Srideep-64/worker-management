import { PrismaClient } from "@prisma/client";
import { isProduction } from "../config/env.js";

// A single shared instance avoids exhausting Postgres connections, especially
// under `node --watch` in dev where the module can otherwise be re-evaluated.
export const prisma = new PrismaClient({
  log: isProduction ? ["error", "warn"] : ["warn", "error"],
});
