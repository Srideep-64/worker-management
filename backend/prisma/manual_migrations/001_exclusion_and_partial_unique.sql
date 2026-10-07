-- Run this manually after `prisma migrate deploy`, or fold it into a Prisma
-- migration's generated SQL file. Prisma's schema DSL cannot express either
-- of these constraints directly, so we add them by hand as defense in depth
-- on top of the application-level checks in the controllers.

-- 1. Prevent overlapping client assignments for the same worker at the DB level.
--    Requires the btree_gist extension (safe to run in any modern Postgres).
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE worker_assignments
  ADD CONSTRAINT worker_assignments_no_overlap
  EXCLUDE USING gist (
    worker_id WITH =,
    daterange(start_date, COALESCE(end_date, 'infinity'::date), '[]') WITH &&
  );

-- 2. Only one ACTIVE timesheet upload per company/month.
--    A partial unique index enforces this without touching SUPERSEDED/FAILED rows.
CREATE UNIQUE INDEX timesheet_uploads_one_active_per_company_month
  ON timesheet_uploads (company_id, period_month)
  WHERE status = 'ACTIVE';
