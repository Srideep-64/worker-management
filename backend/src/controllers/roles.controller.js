import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Roles are a fixed, small lookup table (ET/PT/SF/MS/HP) seeded once.
// No create/update endpoint for v1 — new role codes are added via the seed
// script deliberately, so the Excel importer's "reject unknown role code"
// behavior stays meaningful rather than being silently expandable via API.
export const listRoles = asyncHandler(async (req, res) => {
  const roles = await prisma.role.findMany({ orderBy: { code: "asc" } });
  res.json({ roles });
});
