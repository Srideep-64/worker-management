
function Stat({ label, value }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <p className="text-xs uppercase tracking-wide text-text-muted">
        {label}
      </p>

      <p className="text-lg font-semibold tabular-nums text-text">
        {value ?? "—"}
      </p>
    </div>
  );
}

function Breakdown({ title, rows = [] }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-text-muted">
        {title}
      </p>

      {rows.length === 0 ? (
        <p className="text-sm text-text-muted">—</p>
      ) : (
        <ul className="space-y-0.5 text-sm">
          {rows.map((row) => (
            <li
              key={row.name}
              className="flex justify-between gap-4"
            >
              <span className="text-text">{row.name}</span>

              <span className="tabular-nums text-text-muted">
                {row.hours} h
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function WorkSummary({ summary, data, records }) {
  if (!summary || records.length === 0) return null;

  return (
    <div className="space-y-4 border-t border-border pt-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Total hours" value={summary.totalHours} />
        <Stat label="Worked days" value={summary.workedDays} />
        <Stat label="Absent" value={summary.absentDays} />
        <Stat label="Holidays" value={summary.holidays} />
        <Stat label="Weekly offs" value={summary.weeklyOffs} />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Breakdown
          title="Hours by role"
          rows={summary.byRole}
        />

        <Breakdown
          title="Hours by client"
          rows={summary.byClient}
        />
      </div>

      {data?.activeUpload?.originalFilename && (
        <p className="text-xs text-text-muted">
          Source: {data.activeUpload.originalFilename}
        </p>
      )}

      
    </div>
  );
}
