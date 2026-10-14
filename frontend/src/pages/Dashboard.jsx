import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Building2,
  Plus,
  Users,
  UserPlus,
  RefreshCw,
} from "lucide-react";

import CompanyMonthlyCard from "../components/dashboard/CompanyMonthlyCard.jsx";
import AddCompanyModal from "../components/dashboard/AddCompanyModal.jsx";
import ExpiringDocuments from "../components/dashboard/ExpiringDocuments.jsx";
import AddWorkerModal from "../components/worker/AddWorkerModal.jsx";

import StatCard from "../components/ui/StatCard.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";

import { api } from "../api/client.js";
import { useFetch } from "../hooks.js";

import {
  getCachedCompanies,
  setCachedCompanies,
  invalidateCachedCompanies,
  invalidateCachedWorkers,
} from "../utils/listCache.js";

import {
  invalidateMonthlyStats,
} from "../utils/companyCache.js";

function formatMonth(month) {
  const [year, monthNumber] = month.split("-").map(Number);

  return new Date(year, monthNumber - 1).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

// Previous completed month
function getPreviousMonth() {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  return `${date.getFullYear()}-${String(
    date.getMonth() + 1
  ).padStart(2, "0")}`;
}

// Dashboard cache
let dashboardStatsCache = null;

function invalidateDashboardCache() {
  dashboardStatsCache = null;
}

async function fetchDashboardData() {
  if (dashboardStatsCache) {
    return dashboardStatsCache;
  }

  const [companiesResult, workersResult] = await Promise.allSettled([
    (async () => {
      const cached = getCachedCompanies();

      if (cached) return cached;

      const response = await api.get("/companies");
      setCachedCompanies(response);

      return response;
    })(),

    api.get(`/workers?page=1&pageSize=1&month=${new Date().getFullYear()}-${String(
  new Date().getMonth() + 1
).padStart(2, "0")}&status=ACTIVE`),
  ]);

  const failedSections = [];

  let companiesData = { companies: [] };
  let workersData = { workers: [], pagination: null };

  if (companiesResult.status === "fulfilled") {
    companiesData = companiesResult.value;
  } else {
    failedSections.push("Companies");
  }

  if (workersResult.status === "fulfilled") {
    workersData = workersResult.value;
  } else {
    failedSections.push("Workers");
  }

  const result = {
    companies: companiesData.companies || [],

    companiesCount:
      companiesData.pagination?.total ??
      companiesData.pagination?.totalCount ??
      companiesData.companies?.length ??
      0,

    workersCount:
      workersData.pagination?.total ??
      workersData.pagination?.totalCount ??
      workersData.workers?.length ??
      0,

    failedSections,
  };

  if (failedSections.length === 0) {
    dashboardStatsCache = result;
  }

  return result;
}

// Main Dashboard
export default function Dashboard() {
  const [adding, setAdding] = useState(false);
  const [addingWorker, setAddingWorker] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const month = getPreviousMonth();

  const { data, error, loading, reload } = useFetch(
    fetchDashboardData,
    []
  );

  const companies = data?.companies || [];
  const failedSections = data?.failedSections || [];

  async function handleRefresh() {
    if (refreshing) return;

    setRefreshing(true);
    invalidateDashboardCache();
    invalidateCachedCompanies();

    companies.forEach((company) => {
      invalidateMonthlyStats(company.id, month);
    });

    try {
      await reload();
    } finally {
      setRefreshing(false);
    }
  }

  async function handleCreated() {
    setAdding(false);
    invalidateDashboardCache();
    invalidateCachedCompanies();

    await reload();
  }

  async function handleWorkerCreated() {
  setAddingWorker(false);

  invalidateDashboardCache();
  invalidateCachedCompanies();
  invalidateCachedWorkers();

  await reload();
}

  return (
    <div className="space-y-6">
      {/* Dashboard heading */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-text">
          Dashboard
        </h1>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={handleRefresh}
            disabled={loading || refreshing}
          >
            <RefreshCw
              className={`h-4 w-4 ${
                refreshing ? "animate-spin" : ""
              }`}
            />
            Refresh
          </button>

          <button
            type="button"
            className="btn-accent"
            onClick={() => setAddingWorker(true)}
            disabled={loading || companies.length === 0}
            title={
              companies.length === 0
                ? "Add a company before creating a worker"
                : undefined
            }
          >
            <UserPlus className="h-4 w-4" />
            Add worker
          </button>

          <button
            type="button"
            className="btn-accent"
            onClick={() => setAdding(true)}
          >
            <Plus className="h-4 w-4" />
            Add company
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
        >
          {error.message || "Failed to load dashboard data."}
        </div>
      )}

      {failedSections.length > 0 && (
        <div
          role="status"
          className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
        >
          Could not load: {failedSections.join(", ")}. Try refreshing.
        </div>
      )}

    {/* Overall totals */}
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <StatCard
        label="Total companies"
        value={loading ? "…" : data?.companiesCount ?? "—"}
        icon={Building2}
      />

      <Link
        to="/workers"
        className="group block overflow-hidden rounded-xl border border-border bg-surface transition-colors hover:border-accent hover:bg-surface focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
        aria-label="View active workers"
      >
        <StatCard
          label="Active workers"
          value={loading ? "…" : data?.workersCount ?? "—"}
          icon={Users}
        />
      </Link>
    </div>

      {/* Monthly company cards */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-text">
            Companies
          </h2>

          <p className="mt-1 text-sm text-text-muted">
              {formatMonth(month)} Overview | Overall work hours and Report downloads
          </p>
        </div>

        {loading ? (
          <div className="py-10 text-center text-sm text-text-muted">
            Loading companies...
          </div>
        ) : companies.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No companies yet"
            description="Add your first company to start managing its workers."
          />
        ) : (
          <div className="grid grid-cols-1 gap-5 2xl:grid-cols-2">
            {companies.map((company) => (
              <CompanyMonthlyCard
                key={company.id}
                company={company}
                month={month}
              />
            ))}
          </div>
        )}
      </section>

      <div className="mt-6">
        <ExpiringDocuments />
      </div>

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
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}