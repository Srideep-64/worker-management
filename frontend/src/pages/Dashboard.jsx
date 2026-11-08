import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  Plus,
  RefreshCw,
  UserPlus,
  Users,
  TrendingUp,
  TrendingDown,
  Minus,
  BuildingComplexPlus,
} from "lucide-react";

import CompanyMonthlyCard from "../components/dashboard/CompanyMonthlyCard.jsx";
import AddCompanyModal from "../components/dashboard/AddCompanyModal.jsx";
import ExpiringDocuments from "../components/dashboard/ExpiringDocuments.jsx";
import AddWorkerModal from "../components/worker/AddWorkerModal.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";
import RecentActivity from "../components/dashboard/RecentActivity.jsx";

import { api, invalidate } from "../api/client.js";
import { useFetch } from "../hooks.js";

// Use UAE time, not the computer's time zone. Also handles January -> December.
function getPreviousUaeMonth() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());

  const year = Number(parts.find((part) => part.type === "year").value);
  const month = Number(parts.find((part) => part.type === "month").value);
  const date = new Date(Date.UTC(year, month - 2, 1));

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatMonth(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber - 1, 1)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  });
}

function TrendMetric({ label, item, unit, loading }) {
  const ready = Boolean(item && item.difference !== null && item.difference !== undefined);
  const difference = ready ? Number(item.difference) : 0;
  const Icon = difference > 0 ? TrendingUp : difference < 0 ? TrendingDown : Minus;
  const directional = difference > 0 ? "text-emerald-600 dark:text-emerald-400" : difference < 0 ? "text-rose-600 dark:text-rose-400" : "text-text-muted";
  const format = (value) => unit === "AED"
    ? `AED ${Number(value).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `${Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 })} h`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <div>
        <p className="text-xs font-medium text-text-muted">{label}</p>
        <p className="mt-1 text-xl font-bold tabular-nums text-text">
          {loading ? "…" : item?.currentAverage != null ? format(item.currentAverage) : "—"}
        </p>
      </div>
      {!loading && ready && (
        <div className={`text-right ${directional}`} title="Difference from the average of the preceding two months">
          <span className="inline-flex items-center justify-end gap-1 text-sm font-semibold tabular-nums">
            <Icon className="h-4 w-4" />
            {difference > 0 ? "+" : difference < 0 ? "−" : ""}{format(Math.abs(difference))}
          </span>
          <p className="text-xs tabular-nums">{item.percent > 0 ? "+" : ""}{item.percent}%</p>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [adding, setAdding] = useState(false);
  const [addingWorker, setAddingWorker] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [month, setMonth] = useState(getPreviousUaeMonth);

  const { data, error, loading, reload } = useFetch(
    () => api.get(`/dashboard?month=${encodeURIComponent(month)}`),
    [month],
  );

  const companies = data?.companies ?? [];

  async function handleRefresh() {
    if (refreshing || loading) return;
    setRefreshing(true);
    invalidate("/dashboard");
    try {
      await reload();
    } finally {
      setRefreshing(false);
    }
  }

  async function handleCompanyCreated() {
    setAdding(false);
    invalidate("/dashboard", "/companies");
    await reload();
  }

  async function handleWorkerCreated() {
    setAddingWorker(false);
    invalidate("/dashboard", "/workers", "/companies");
    await reload();
  }

  return (
    <div className="space-y-7 pb-8">
      {/* Title + editable month selector. Initial value is the previous UAE month. */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text sm:text-3xl">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Workforce records and payroll overview
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-h-11 items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2 shadow-sm">
            <span className="hidden text-sm font-medium text-text-muted sm:inline">
              Reporting month:
            </span>
            <div className="relative flex items-center">
              <input
                type="month"
                value={month}
                onChange={(event) => {
                  if (event.target.value) setMonth(event.target.value);
                }}
                aria-label="Reporting month"
                className="w-[170px] min-w-0 cursor-pointer bg-transparent py-1 pr-9 text-sm font-semibold text-accent outline-none [color-scheme:light] dark:[color-scheme:dark] [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-y-0 [&::-webkit-calendar-picker-indicator]:right-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-9 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0"
              />
              <CalendarDays
                aria-hidden="true"
                className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-accent"
              />
            </div>
          </div>

          <button
            type="button"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium text-text transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
            onClick={handleRefresh}
            disabled={loading || refreshing}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {typeof error === "string" ? error : error?.message || "Failed to load dashboard data."}
        </div>
      )}

      {/* Overview: matching heights, capped widths, and no stretched cards. */}
      <div className="grid w-full max-w-[1080px] grid-cols-1 items-stretch gap-4 md:grid-cols-2">
                <section
          className="flex h-full min-h-[250px] w-full flex-col rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6"
          aria-label="Workforce trends"
        >
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft/70 text-accent">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold text-text">Workforce trends</h2>
              <p className="text-xs text-text-muted">
                {formatMonth(month)} vs previous 2-month average
              </p>
            </div>
          </div>
          <div className="space-y-3">
            <TrendMetric label="Avg hours / worker" item={data?.workforceTrends?.hours} unit="h" loading={loading} />
            <div className="border-t border-border" />
            <TrendMetric label="Avg gross pay / worker" item={data?.workforceTrends?.grossPay} unit="AED" loading={loading} />
          </div>
          {data?.workforceTrends?.reason && !loading && (
            <p className="mt-3 text-xs text-text-muted">{data.workforceTrends.reason}</p>
          )}
        </section>
        <section className="group relative flex h-full min-h-[250px] w-full flex-col justify-between rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6 hover:border-accent">
          {/* The card navigates to Workers; the Add Worker button remains independent. */}
          <Link
            to="/workers"
            aria-label="View active workers"
            className="absolute inset-0 z-10 rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          />
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent">
              <Users className="h-7 w-7" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-text">Active workers</p>
              <div className="flex shrink-0 items-center gap-2 text-accent">
                <span className="text-xs font-medium">
                  View all workers
                </span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </div>
              </div>
              <p className="mt-10 text-6xl font-bold tracking-tight tabular-nums text-accent sm:text-l">
                {loading ? "…" : data?.workersCount ?? "—"}
              </p>
              
              <p className="mt-2 text-sm text-text-muted">
                Total active workers across{" "}
                <span className="font-semibold text-text">
                  {data?.companiesCount ?? 0}
                </span>{" "}
                {data?.companiesCount === 1 ? "company" : "companies"}
              </p>
              
            </div>
          </div>
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={() => setAddingWorker(true)}
              disabled={loading || companies.length === 0}
              
              className="relative z-20 inline-flex shrink-0 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold text-accent transition-colors duration-200 hover:border-accent hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-50"

              >
              <UserPlus className="h-4 w-4" /> Add worker
            </button>
          </div>
        </section>
      </div>

      {/* Recent Activity: four rows visible, additional rows scroll within the panel. */}
      <RecentActivity />

      {/* Monthly results; changing month updates the request and all company reports. */}
      <section id="dashboard-companies" className="scroll-mt-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div className="flex min-w-0 items-center gap-3">
            <Building2 className="h-6 w-6 shrink-0 text-accent" />
            <div>
              <h2 className="text-xl font-bold text-text">
                Showing {loading ? "…" : data?.companiesCount ?? companies.length} Companies
              </h2>
              <p className="mt-0.5 text-sm text-text-muted">
                Work records and payroll for {formatMonth(month)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-accent bg-accent-soft/40 px-3 py-2 text-sm font-semibold text-accent transition-colors hover:bg-accent-soft"
          >
            <BuildingComplexPlus className="h-4 w-4" /> Add company
          </button>
        </div>

        {loading ? (
          <div className="rounded-xl border border-border bg-surface py-12 text-center text-sm text-text-muted">
            Loading company records...
          </div>
        ) : companies.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No companies yet"
            description="Add your first company to start managing its workers."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {companies.map((company) => (
              <CompanyMonthlyCard key={company.id} company={company} month={month} />
            ))}
          </div>
        )}
      </section>

      <section>
        <ExpiringDocuments items={data?.expiring ?? []} loading={loading} />
      </section>

      {addingWorker && (
        <AddWorkerModal
          companies={companies}
          onClose={() => setAddingWorker(false)}
          onSaved={handleWorkerCreated}
        />
      )}

      {adding && (
        <AddCompanyModal
          onClose={() => setAdding(false)}
          onCreated={handleCompanyCreated}
        />
      )}
    </div>
  );
}