
import { useState } from "react";
import { Link } from "react-router-dom";
import { Users, RefreshCw,ChevronLeft,ChevronRight } from "lucide-react";

import EmptyState from "../ui/EmptyState.jsx";
import { api } from "../../api/client.js";
import { useFetch } from "../../hooks.js";
import { getCachedWork, setCachedWork } from "../../utils/workCache.js";
import {
  getWorkerSummary,
  setWorkerSummary,
  invalidateWorkerSummaries,
} from "../../utils/companyCache.js";
import { invalidateCompanyWorkers } from "../../utils/companyDetailCache.js";

export default function WorkersTab({
  workers,
  companyId,
  workerStatus,
  setWorkerStatus,
  month,
  setMonth,
  page,
  setPage,
  hasNextPage,
  workersLoading,
  setWorkersRefreshKey,
  PAGE_SIZE
}) {
  const loading = workersLoading;
  const error = null;

  const hoursByWorker = new Map(
  workers.map((worker) => [
    worker.id,
    {
      workerId: worker.id,
      totalHours: worker.totalHours ?? 0,
      absentDays: worker.absentDays ?? 0,
      failed: false,
    },
  ])
);

  function changeMonth(offset) {
    const [year, monthNumber] = month.split("-").map(Number);
    const date = new Date(year, monthNumber - 1 + offset, 1);

    setMonth(
      `${date.getFullYear()}-${String(
        date.getMonth() + 1
      ).padStart(2, "0")}`
    );

    
  }

  function handleRefresh() {
    invalidateCompanyWorkers(companyId);
    setWorkersRefreshKey((key) => key + 1);
  }

return (
<div className="space-y-4">
  <div className="flex flex-wrap items-center justify-between gap-3">
    {/* Left: Title and month navigation */}
    <div className="flex flex-wrap items-center gap-3">
      <p className="text-sm font-medium text-text whitespace-nowrap">
        Worker Attendance
      </p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn-secondary min-w-0 px-2"
          aria-label="Previous month"
          onClick={() => changeMonth(-1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <input
          type="month"
          aria-label="Select month"
          className="input w-auto"
          value={month}
          onChange={(event) => {
            if (event.target.value) {
              setMonth(event.target.value);
            }
          }}
        />

        <button
          type="button"
          className="btn-secondary min-w-0 px-2"
          aria-label="Next month"
          onClick={() => changeMonth(1)}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>

    {/* Right: Refresh and worker status */}
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="btn-secondary"
        onClick={handleRefresh}
        disabled={loading}
      >
        <RefreshCw className="h-4 w-4" />
        Refresh
      </button>

      <select
        aria-label="Filter workers by status"
        className="input w-auto"
        value={workerStatus}
        onChange={(event) => {
          setWorkerStatus(event.target.value);
          setPage(1);
        }}
      >
        <option value="ACTIVE">Active workers</option>
        <option value="INACTIVE">Inactive workers</option>
        <option value="ALL">All workers</option>
      </select>
    </div>
  </div>

  {error && (
    <p role="alert" className="text-sm text-danger">
      {error.message || "Unable to load worker statistics."}
    </p>
  )}

      <div className="overflow-x-auto">
        {workers.length === 0 ? (
          <EmptyState
            icon={Users}
            title={
              workerStatus === "INACTIVE"
                ? "No inactive workers"
                : workerStatus === "ACTIVE"
                  ? "No active workers"
                  : "No workers in this company"
            }
            description={
              workerStatus === "INACTIVE"
                ? "This company has no inactive workers matching the current filter."
                : workerStatus === "ACTIVE"
                  ? "There are no active workers on this company page."
                  : "Workers assigned to this company will appear here."
            }
          />
        ) : (
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
                <th className="px-3 py-2 font-medium"></th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Job title</th>
                <th className="px-3 py-2 font-medium">Work hours</th>
                <th className="px-3 py-2 font-medium">Absent days</th>
              </tr>
            </thead>

            <tbody>
              {workers.map((worker,index) => {
                const stats = hoursByWorker.get(worker.id);
                const unavailable = stats?.failed;

                return (
                  <tr
                    key={worker.id}
                    className="border-b border-border last:border-0"
                  >  
                    <td className="px-3 py-2.5 text-text">
                      {(page - 1) * PAGE_SIZE + index+1}
                    </td>
                    <td className="px-3 py-2.5 font-medium">
                      <Link
                        to={`/workers/${worker.id}`}
                        state={{
                          returnTo: `/companies/${companyId}`,
                          returnLabel: "Company Details",
                          returnTab: "Workers",
                          returnWorkerPage: page,
                          returnWorkerStatus: workerStatus,
                          returnMonth: month,
                          profileMonth:month,
                        }}
                        className="font-medium text-accent hover:underline"
                      >
                        {worker.name}
                      </Link>
                    </td>

                    <td className="px-3 py-2.5 text-text-muted">
                      {worker.jobTitle || "—"}
                    </td>

                    <td className="px-3 py-2.5 tabular-nums text-text-muted">
                      {loading
                        ? "..."
                        : unavailable
                          ? "—"
                          : `${stats?.totalHours ?? 0} h`}
                    </td>

                    <td className="px-3 py-2.5 tabular-nums text-text-muted">
                      {loading
                        ? "..."
                        : unavailable
                          ? "—"
                          : stats?.absentDays ?? 0}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            className="btn-secondary"
            disabled={page === 1 || workersLoading}
            onClick={() => setPage((current) => current - 1)}
          >
            Previous
          </button>

          <p className="text-sm text-text-muted">
            Page {page} · {workers.length} workers shown
          </p>

          <button
            type="button"
            className="btn-secondary"
            disabled={!hasNextPage || workersLoading || workers.length === 0}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
