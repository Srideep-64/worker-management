CREATE UNIQUE INDEX IF NOT EXISTS timesheet_uploads_one_active
ON timesheet_uploads (company_id, period_month)
WHERE status = 'ACTIVE';