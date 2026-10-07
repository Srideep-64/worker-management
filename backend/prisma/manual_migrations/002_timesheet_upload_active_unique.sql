-- Only one ACTIVE timesheet upload is allowed per (company, period_month).
-- Historical PROCESSING/SUPERSEDED/FAILED rows for the same company/month
-- are fine and expected — this index only constrains rows where
-- status = 'ACTIVE', which a plain @@unique in schema.prisma can't express
-- (that would forbid multiple SUPERSEDED rows too, which we need to keep).
CREATE UNIQUE INDEX timesheet_uploads_one_active_per_company_month
  ON timesheet_uploads (company_id, period_month)
  WHERE status = 'ACTIVE';
