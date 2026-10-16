
import { useState } from "react";
import { api } from "../../api/client.js";
import { useFetch } from "../../hooks.js";

import {
  getCachedWork,
  setCachedWork,
} from "../../utils/workCache.js";

// Keep your existing Stat and Breakdown components here.
function Stat({ label, value, valueClassName = "text-text" }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <p className="text-xs uppercase tracking-wide text-text-muted">
        {label}
      </p>
      <p className={`text-lg font-semibold tabular-nums ${valueClassName}`}>
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
        <ul className="space-y-1 text-sm">
          {rows.map((row) => (
            <li key={row.name} className="flex justify-between gap-4">
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
export default function WorkSummary({ workerId,month,refreshKey, }) {

  const { data, error, loading } = useFetch(async () => {
    const cached = getCachedWork(workerId, month);

    if (cached) return cached;

    const response = await api.get(
      `/workers/${workerId}/work?month=${month}`
    );

    setCachedWork(workerId, month, response);
    return response;
  }, [workerId, month, refreshKey]);

  const summary = data?.summary;

  if (loading && !data) {
    return (
      <section className="rounded-lg border border-border p-4">
        <h3 className="text-sm font-semibold text-text">Work Summary</h3>
        <p className="mt-3 text-sm text-text-muted">Loading work summary...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-lg border border-border p-4">
        <h3 className="text-sm font-semibold text-text">Work Summary</h3>
        <p className="mt-3 text-sm text-danger">
          {error.message || "Failed to load work summary."}
        </p>
      </section>
    );
  }

  if (!summary) {
    return (
      <section className="rounded-lg border border-border p-4">
        <h3 className="text-sm font-semibold text-text">Work Summary</h3>
        <p className="mt-3 text-sm text-text-muted">
          No summary data available for this month.
        </p>
      </section>
    );
  }

  const totalHours = Number(summary.totalHours ?? 0);
  const absentDays = Number(summary.absentDays ?? 0);

  return (
    <section className="space-y-4 rounded-lg bg-surface border border-border p-4">
      <h3 className="text-sm font-semibold text-text">
        Work Summary
      </h3>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Total hours" value={totalHours.toFixed(2)} />
        <Stat label="Worked days" value={summary.workedDays} />
        <Stat label="Absent" value={absentDays} />
        <Stat label="Holidays" value={summary.holidays} />
        <Stat label="Weekly offs" value={summary.weeklyOffs} />
      </div>

      <Breakdown title="Hours by role" rows={summary.byRole} />

      {data?.activeUpload?.originalFilename && (
        <p className="text-xs text-text-muted">
          Source: {data.activeUpload.originalFilename}
        </p>
      )}
    </section>
  );
}
