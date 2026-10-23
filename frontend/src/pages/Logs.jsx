import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { History, RefreshCw } from "lucide-react";

import Card from "../components/ui/Card.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";

import { api, qs } from "../api/client.js";
import { useFetch } from "../hooks.js";

const CATEGORIES = [
  ["WORKERS", "Workers"],
  ["WORK_RECORDS", "Work records"],
  ["TIMESHEETS", "Timesheets"],
  ["PAYROLL", "Payroll"],
  ["DOCUMENTS", "Documents"],
  ["COMPANIES", "Companies"],
];
const CATEGORY_LABEL = Object.fromEntries(CATEGORIES);

// Timestamps are stored in UTC and always shown in UAE time.
function formatLogTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const opts = { timeZone: "Asia/Dubai" };
  const time = d.toLocaleTimeString("en-US", { ...opts, hour: "numeric", minute: "2-digit" });
  const date = d.toLocaleDateString("en-US", { ...opts, month: "short", day: "numeric", year: "numeric" });
  return `${time} · ${date}`;
}

// YYYY-MM-DD in UAE time, `daysAgo` days back.
const uaeDay = (daysAgo = 0) =>
  new Date(Date.now() + 4 * 3_600_000 - daysAgo * 86_400_000).toISOString().slice(0, 10);

export default function Logs() {
  const [category, setCategory] = useState("");
  const [userId, setUserId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);

  // Wait until typing pauses before querying.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Changing any filter goes back to page 1.
  const onFilter = (setter) => (event) => {
    setter(event.target.value);
    setPage(1);
  };

  const usersQuery = useFetch(() => api.get("/logs/users"), []);

  const { data, error, loading } = useFetch(
    () =>
      api.get(
        `/logs${qs({ category, userId, from, to, search, page, pageSize: 25 })}`,
      ),
    [category, userId, from, to, search, page, refreshKey],
  );

  const users = usersQuery.data?.users || [];
  const logs = data?.logs || [];
  const pagination = data?.pagination;

  return (
    <Card
      title="Logs"
      action={
        <button
          type="button"
          className="btn-secondary inline-flex items-center gap-2"
          onClick={() => setRefreshKey((key) => key + 1)}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      }
    >
      <p className="mb-4 text-sm text-text-muted">
        Activity performed in the application. Logs are kept for 60 days.
      </p>

      {error && (
        <p role="alert" className="mb-4 text-sm text-danger">
          {error || "Failed to load logs."}
        </p>
      )}

      <div className="mb-5 flex flex-wrap gap-3">
        <input
          className="input w-auto"
          placeholder="Search worker name, code, admin or description"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          aria-label="Search logs"
        />

        <select
          className="input w-auto"
          value={category}
          onChange={onFilter(setCategory)}
          aria-label="Filter logs by category"
        >
          <option value="">All categories</option>
          {CATEGORIES.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>

        <select
          className="input w-auto"
          value={userId}
          onChange={onFilter(setUserId)}
          aria-label="Filter logs by admin"
        >
          <option value="">All admins</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>{user.name}</option>
          ))}
        </select>

        <input
          type="date"
          className="input w-auto"
          value={from}
          min={uaeDay(60)}
          max={to || uaeDay(0)}
          onChange={onFilter(setFrom)}
          aria-label="From date"
        />
        <input
          type="date"
          className="input w-auto"
          value={to}
          min={from || uaeDay(60)}
          max={uaeDay(0)}
          onChange={onFilter(setTo)}
          aria-label="To date"
        />
      </div>

      {loading && logs.length === 0 ? (
        <p className="py-8 text-center text-sm text-text-muted">Loading logs…</p>
      ) : logs.length === 0 ? (
        <EmptyState
          icon={History}
          title="No activity found"
          description="Try changing the filters. New activity appears here as it happens."
        />
      ) : (
        <ul className="divide-y divide-border">
          {logs.map((log) => (
            <li key={log.id} className="py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-text">{log.username || "Unknown"}</span>
                <span className="text-xs text-text-muted">{formatLogTime(log.createdAt)}</span>
            </div>

            <p className="mt-1 text-sm text-text-muted">{log.description}</p>

            <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-border px-2 py-0.5 text-xs text-text-muted">
                {CATEGORY_LABEL[log.category] ?? log.category}
                </span>
                {log.workerId && (
                <Link
                    to={`/workers/${log.workerId}`}
                    className="text-xs text-accent-dark hover:underline"
                >
                    {log.workerCode ?? "Worker"}
                    {log.workerName ? ` · ${log.workerName}` : ""}
                </Link>
                )}
            </div>
            </li>
          ))}
        </ul>
      )}

      {pagination && pagination.totalPages > 1 && (
        <div className="mt-5 flex items-center justify-between text-sm text-text-muted">
          <span>
            Page {pagination.page} of {pagination.totalPages} · {pagination.total} entries
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-secondary"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={page >= pagination.totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}