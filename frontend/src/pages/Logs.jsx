import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Building2, CalendarDays, FileSpreadsheet, FileText, History,
  RefreshCw, Search, Users, Wallet, ClipboardList, X,
} from "lucide-react";
import EmptyState from "../components/ui/EmptyState.jsx";
import { api, qs } from "../api/client.js";
import { useFetch } from "../hooks.js";

const CATEGORIES = [
  ["WORKERS", "Workers"], ["WORK_RECORDS", "Work records"],
  ["TIMESHEETS", "Timesheets"], ["PAYROLL", "Payroll"],
  ["DOCUMENTS", "Documents"], ["COMPANIES", "Companies"],
];
const LABEL = Object.fromEntries(CATEGORIES);
const ICONS = {
  WORKERS: Users, WORK_RECORDS: ClipboardList, TIMESHEETS: FileSpreadsheet,
  PAYROLL: Wallet, DOCUMENTS: FileText, COMPANIES: Building2,
};

function formatLogTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const options = { timeZone: "Asia/Dubai" };
  return `${d.toLocaleTimeString("en-US", { ...options, hour: "numeric", minute: "2-digit" })} · ${d.toLocaleDateString("en-US", { ...options, day: "numeric", month: "short", year: "numeric" })}`;
}
const uaeDay = (daysAgo = 0) =>
  new Date(Date.now() + 4 * 3600000 - daysAgo * 86400000).toISOString().slice(0, 10);

function DateControl({ label, value, min, max, onChange }) {
  return (
    <label className="relative flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm text-text">
      <span className="shrink-0 text-xs text-text-muted">{label}</span>
      <input
        type="date" value={value} min={min} max={max} onChange={onChange}
        aria-label={`${label} date`}
        className="h-full w-[125px] min-w-0 cursor-pointer bg-transparent pr-6 text-xs text-text outline-none [color-scheme:light] dark:[color-scheme:dark] [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-1 [&::-webkit-calendar-picker-indicator]:top-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-9 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0"
      />
      <CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-accent" />
    </label>
  );
}

export default function Logs() {
  const [params, setParams] = useSearchParams();
  const [category, setCategory] = useState(params.get("category") || "");
  const [action, setAction] = useState(params.get("action") || "");
  const [userId, setUserId] = useState(params.get("userId") || "");
  const [companyId, setCompanyId] = useState(params.get("companyId") || "");
  const [from, setFrom] = useState(params.get("from") || "");
  const [to, setTo] = useState(params.get("to") || "");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);

  // Dashboard activity links update these filters without reloading the SPA.
  const serializedParams = params.toString();
  useEffect(() => {
    const next = new URLSearchParams(serializedParams);
    setCategory(next.get("category") || "");
    setAction(next.get("action") || "");
    setUserId(next.get("userId") || "");
    setCompanyId(next.get("companyId") || "");
    setFrom(next.get("from") || "");
    setTo(next.get("to") || "");
    setPage(1);
  }, [serializedParams]);

  useEffect(() => {
    const timer = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const usersQuery = useFetch(() => api.get("/logs/users"), []);
  const { data, error, loading } = useFetch(
    () => api.get(`/logs${qs({ category, action, userId, companyId, from, to, search, page, pageSize: 25 })}`),
    [category, action, userId, companyId, from, to, search, page, refreshKey]
  );
  const users = usersQuery.data?.users || [];
  const logs = data?.logs || [];
  const pagination = data?.pagination;
  const isScoped = Boolean(action || companyId);
  const filterChange = (setter) => (event) => { setter(event.target.value); setPage(1); };

  function clearScope() {
    setParams({}); setCategory(""); setAction(""); setUserId(""); setCompanyId("");
    setFrom(""); setTo(""); setPage(1);
  }

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">Activity Logs</h1>
          <p className="mt-1 text-sm text-text-muted">Administrative changes · 60-day history · UAE time</p>
        </div>
        <button type="button" onClick={() => setRefreshKey((k) => k + 1)} disabled={loading}
          className="btn-secondary inline-flex items-center gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>
      <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex flex-wrap gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input className="input w-full pl-9" placeholder="Search workers, admins or descriptions"
              value={searchInput} onChange={(e) => setSearchInput(e.target.value)} aria-label="Search logs" />
          </div>
          <select className="input w-auto" value={category} onChange={filterChange(setCategory)} aria-label="Category">
            <option value="">All categories</option>
            {CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select className="input w-auto" value={userId} onChange={filterChange(setUserId)} aria-label="Administrator">
            <option value="">All admins</option>
            {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
          </select>
          <DateControl label="From" value={from} min={uaeDay(60)} max={to || uaeDay()} onChange={filterChange(setFrom)} />
          <DateControl label="To" value={to} min={from || uaeDay(60)} max={uaeDay()} onChange={filterChange(setTo)} />
        </div>
        {isScoped && (
          <div className="mb-4 flex items-center justify-between gap-2 rounded-lg bg-accent-soft/30 px-3 py-2 text-xs text-text-muted">
            <span>Showing activity matching the selected dashboard summary</span>
            <button type="button" onClick={clearScope} className="inline-flex items-center gap-1 font-semibold text-accent"><X className="h-3.5 w-3.5" /> Clear filters</button>
          </div>
        )}
        {error && <p role="alert" className="mb-4 text-sm text-danger">{typeof error === "string" ? error : error?.message || "Failed to load logs."}</p>}
        {loading && logs.length === 0 ? (
          <p className="py-8 text-center text-sm text-text-muted">Loading activity…</p>
        ) : logs.length === 0 ? (
          <EmptyState icon={History} title="No activity found" description="Try changing the filters." />
        ) : (
          <ol className="divide-y divide-border">
            {logs.map((log) => {
              const Icon = ICONS[log.category] || History;
              return (
                <li key={log.id} className="flex gap-3 py-4 first:pt-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft/60 text-accent">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <p className="text-sm font-semibold text-text">{log.username || "Unknown"}</p>
                      <time className="text-xs text-text-muted" dateTime={log.createdAt}>{formatLogTime(log.createdAt)}</time>
                    </div>
                    <p className="mt-1 text-sm text-text-muted">{log.description}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-border bg-surface-secondary px-2 py-0.5 text-xs text-text-muted">{LABEL[log.category] || log.category}</span>
                      {log.workerId && (
                        <Link className="text-xs font-medium text-accent hover:underline" to={`/workers/${log.workerId}`}>
                          {log.workerCode || "Worker"}{log.workerName ? ` · ${log.workerName}` : ""}
                        </Link>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        {pagination && pagination.totalPages > 1 && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-sm text-text-muted">
            <span>Page {pagination.page} of {pagination.totalPages} · {pagination.total} entries</span>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>Previous</button>
              <button type="button" className="btn-secondary" disabled={page >= pagination.totalPages || loading} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
