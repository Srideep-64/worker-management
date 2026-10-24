export async function lockCompanyMonth(tx, companyId, month, mode = "exclusive") {
  const key = `${companyId}:${month}`; // month = "YYYY-MM"
  if (mode === "shared") {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(hashtext(${key}::text))`;
  } else {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}::text))`;
  }
}