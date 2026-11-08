import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Building2,
  BuildingComplexPlusIcon,
  CalendarDays,
  Plus,
  RefreshCw,
  UserPlus,
  Users,
} from "lucide-react";

import CompanyMonthlyCard from "../components/dashboard/CompanyMonthlyCard.jsx";
import AddCompanyModal from "../components/dashboard/AddCompanyModal.jsx";
import ExpiringDocuments from "../components/dashboard/ExpiringDocuments.jsx";
import AddWorkerModal from "../components/worker/AddWorkerModal.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";

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

      {/* Summary cards: only the card body navigates; Add buttons remain independent. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="group relative min-h-[164px] rounded-2xl border border-border bg-surface p-5 shadow-sm transition-colors hover:border-accent/50">
          <a
            href="#dashboard-companies"
            aria-label="Jump to companies"
            className="absolute inset-0 z-10 rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          />
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-accent-soft/70 text-accent">
              <Building2 className="h-7 w-7" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-text">Total companies</p>
                <ArrowRight className="h-5 w-5 text-accent opacity-70 transition-transform group-hover:translate-x-1" />
              </div>
              <p className="mt-1 text-3xl font-bold tabular-nums text-text">
                {loading ? "…" : data?.companiesCount ?? "—"}
              </p>
              <p className="mt-1 text-xs text-text-muted">Manage company details and records</p>
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="relative z-20 inline-flex items-center gap-2 rounded-lg border border-accent/30 bg-accent-soft/40 px-3 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent-soft"
            >
              <BuildingComplexPlusIcon className="h-4 w-4" />
              Add company
            </button>
          </div>
        </div>

        <div className="group relative min-h-[164px] rounded-2xl border border-border bg-surface p-5 shadow-sm transition-colors hover:bg-accent-soft/5 hover:border-accent">
          <Link
            to="/workers"
            aria-label="View workers"
            className="absolute inset-0 z-10 rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          />
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent">
              <Users className="h-7 w-7" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-text">Active workers</p>
                <ArrowRight className="h-5 w-5 text-accent transition-transform group-hover:translate-x-1" />
              </div>
              <p className="mt-1 text-3xl font-bold tabular-nums text-accent">
                {loading ? "…" : data?.workersCount ?? "—"}
              </p>
              <p className="mt-1 text-xs text-text-muted">View and manage all workers</p>
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => setAddingWorker(true)}
              disabled={loading || companies.length === 0}
              className="relative z-20 inline-flex items-center gap-2 rounded-lg border border-accent/30 bg-accent-soft/40 px-3 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent-soft"
            >
              <UserPlus className="h-4 w-4" />
              Add worker
            </button>
          </div>
        </div>
      </div>

      {/* Monthly results; changing month updates the request and all company reports. */}
      <section id="dashboard-companies" className="scroll-mt-6 space-y-4">
        <div className="flex items-center gap-3 border-b border-border pb-3">
          <Building2 className="h-6 w-6 shrink-0 text-accent" />
          <div>
            <h2 className="text-xl font-bold text-text">Companies</h2>
            <p className="mt-0.5 text-sm text-text-muted">
              Work records and payroll for {formatMonth(month)}
            </p>
          </div>
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