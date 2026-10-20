import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Building2,
  Users,
  UserPlus,
  RefreshCw,
  BuildingComplexPlus
} from "lucide-react";

import CompanyMonthlyCard from "../components/dashboard/CompanyMonthlyCard.jsx";
import AddCompanyModal from "../components/dashboard/AddCompanyModal.jsx";
import ExpiringDocuments from "../components/dashboard/ExpiringDocuments.jsx";
import AddWorkerModal from "../components/worker/AddWorkerModal.jsx";

import StatCard from "../components/ui/StatCard.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";

import { api,invalidate } from "../api/client.js";
import { useFetch } from "../hooks.js";

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

// Main Dashboard
export default function Dashboard() {
  const [adding, setAdding] = useState(false);
  const [addingWorker, setAddingWorker] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const month = getPreviousMonth();

  const { data, error, loading, reload } = useFetch(
    () => api.get(`/dashboard?month=${month}`),
    [month],
  );

  const companies = data?.companies || [];

  async function handleRefresh() {
    if (refreshing) return;

    setRefreshing(true);
    invalidate("/dashboard");
    try {
      await reload();
    } finally {
      setRefreshing(false);
    }
  }

  async function handleCreated() {
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
  <div className="space-y-6">
    {/* Dashboard heading */}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-semibold text-text">
        Dashboard
      </h1>

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
    </div>

    {error && (
      <div
        role="alert"
        className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
      >
        {error || "Failed to load dashboard data."}
      </div>
    )}


    {/* Overall totals */}
    <div className="grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
      <StatCard
  label="Total companies"
  value={loading ? "…" : data?.companiesCount ?? "—"}
  icon={Building2}
  action={
    <button
      type="button"
      className=" w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:border-accent hover:bg-accent-soft/30"
      onClick={() => setAdding(true)}
    >
      <BuildingComplexPlus className="mr-2 inline h-4 w-4" />
      Add company
    </button>
  }
/>

<Link
  to="/workers"
  className="group block rounded-xl focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
  aria-label="View active workers"
>
  <StatCard
    label="Active workers"
    value={loading ? "…" : data?.workersCount ?? "—"}
    icon={Users}
    action={
      <button
        type="button"
        className="w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:border-accent hover:bg-accent-soft/30"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setAddingWorker(true);
        }}
        disabled={loading || !companies?.length}
      >
        <UserPlus className="mr-2 inline h-4 w-4" />
        Add worker
      </button>
    }
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
              {formatMonth(month)} Work hours and Report downloads
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
          <div className="grid grid-cols-1 gap-5 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
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
        <ExpiringDocuments items={data?.expiring ?? []} loading={loading}  />
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