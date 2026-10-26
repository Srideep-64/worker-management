
export async function lockCompanyMonth(
  tx,
  companyId,
  month,
  mode = "exclusive"
) {
  const key = `${companyId}:${month}`;

  if (mode === "shared") {
    await tx.$queryRaw`
      WITH lock_result AS (
        SELECT pg_advisory_xact_lock_shared(
          hashtext(${key}::text)
        )
      )
      SELECT 1 AS locked
    `;
  } else {
    await tx.$queryRaw`
      WITH lock_result AS (
        SELECT pg_advisory_xact_lock(
          hashtext(${key}::text)
        )
      )
      SELECT 1 AS locked
    `;
  }
}
