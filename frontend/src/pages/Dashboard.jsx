import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Building2,
  Plus,
  Users,
  RefreshCw,
  FileSpreadsheet,
  FileText,
} from "lucide-react";

import StatCard from "../components/ui/StatCard.jsx";
import Card from "../components/ui/Card.jsx";
import Badge from "../components/ui/Badge.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";
import Modal from "../components/ui/Modal.jsx";

import { api, ApiError } from "../api/client.js";
import { useFetch,DOC_LABELS } from "../hooks.js";

import {
  getCachedCompanies,
  setCachedCompanies,
  invalidateCachedCompanies,
} from "../utils/listCache.js";

import {
  getMonthlyStats,
  setMonthlyStats,
  invalidateMonthlyStats,
} from "../utils/companyCache.js";

// Previous completed month
function getPreviousMonth() {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  return `${date.getFullYear()}-${String(
    date.getMonth() + 1
  ).padStart(2, "0")}`;
}

function formatMonth(month) {
  const [year, monthNumber] = month.split("-").map(Number);

  return new Date(year, monthNumber - 1, 1).toLocaleDateString(
    "en-US",
    {
      month: "short",
      year: "numeric",
    }
  );
}

function formatAED(value) {
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value ?? 0);
}

// Add Company Modal
function AddCompanyModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    code: "",
    name: "",
  });

  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function updateField(event) {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function submit(event) {
    event.preventDefault();

    setSaving(true);
    setError("");

    try {
      await api.post("/companies", {
        code: form.code.trim(),
        name: form.name.trim(),
      });

      // Clear the cached companies list after creation.
      invalidateCachedCompanies();

      await onCreated();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err.message || "Failed to create company."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Add company" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="company-code">
            Company code *
          </label>

          <input
            id="company-code"
            name="code"
            className="input"
            value={form.code}
            onChange={updateField}
            placeholder="e.g. ABC"
            maxLength={10}
            required
          />
        </div>

        <div>
          <label className="label" htmlFor="company-name">
            Company name *
          </label>

          <input
            id="company-name"
            name="name"
            className="input"
            value={form.name}
            onChange={updateField}
            placeholder="Enter company name"
            maxLength={200}
            required
          />
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>

          <button
            type="submit"
            className="btn-primary"
            disabled={saving}
          >
            {saving ? "Saving..." : "Save company"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Download company report using the existing API endpoints
async function downloadCompanyReport(companyId, month, format, companyCode) {
  const url =
    `/api/companies/${encodeURIComponent(companyId)}` +
    `/monthly-report/${format}?month=${encodeURIComponent(month)}`;

  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
  });

  if (!response.ok) {
    const contentType = response.headers.get("content-type") || "";
    let message = `Failed to download ${format.toUpperCase()} report.`;

    if (contentType.includes("application/json")) {
      const payload = await response.json();

      message =
        payload.error?.message ||
        payload.message ||
        message;
    }

    throw new Error(message);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = objectUrl;

  const monthLabel = formatMonth(month).replace(" ", "-");

  link.download =
    format === "excel"
      ? `${companyCode}-timesheet-${monthLabel}.xlsx`
      : `${companyCode}-payroll-${monthLabel}.pdf`;

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

// Individual company dashboard card
function CompanyMonthlyCard({ company, month }) {
  const statsCacheKey = `${company.id}:${month}`;

  const { data, error, loading } = useFetch(
    async () => {
      const cached = getMonthlyStats(statsCacheKey);
      if (cached) return cached;

      const response = await api.get(
        `/companies/${company.id}/stats?month=${month}`
      );

      setMonthlyStats(statsCacheKey, response);
      return response;
    },
    [company.id, month]
  );

  const workerCount =
    company.workerCount ??
    company._count?.workers ??
    company.totalWorkers ??
    "—";

  const totalHours = data?.summary?.totalHours ?? 0;

  return (
    <Link
      to={`/companies/${company.id}`}
     className="group block rounded-xl border border-border bg-surface p-4 transition-colors hover:border-accent hover:bg-surface"
    >
      {/* Company heading */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent-dark">
            {company.code || "Company"}
          </p>

          <h3 className="mt-1 truncate font-semibold text-text group-hover:text-accent">
            {company.name}
          </h3>
        </div>

        <Building2
          size={20}
          className="shrink-0 text-text-muted transition-colors group-hover:text-accent"
        />
      </div>

      {/* Worker count and monthly hours */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-sm text-text-muted">
          {workerCount} workers
        </span>

        <div className="text-right">
          <p className="text-xs text-muted-foreground">Total hours</p>
          <p className="font-semibold tabular-nums text-foreground">
            {loading ? "..." : totalHours.toLocaleString()}
          </p>
          {error && (
            <span className="text-xs text-red-600">
              Failed to load
            </span>
          )}
        </div>
      </div>

      {/* Report downloads */}
      <div className="mt-4 flex gap-2 border-t border-border pt-3">
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            downloadCompanyReport(
              company.id,
              month,
              "excel",
              company.code
            );
          }}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:border-accent hover:bg-accent-soft/30"
        >
          <FileSpreadsheet size={16} />
          Excel
        </button>

        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            downloadCompanyReport(
              company.id,
              month,
              "pdf",
              company.code
            );
          }}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:border-accent hover:bg-accent-soft/30"
        >
          <FileText size={16} />
          PDF
        </button>
      </div>
    </Link>
  );
}

// Cache expiring documents indefinitely until manually refreshed.
let expiringDocumentsCache = null;

function ExpiringDocuments() {
  const [refreshKey, setRefreshKey] = useState(0);

  const { data, error, loading } = useFetch(
    async () => {
      if (refreshKey === 0 && expiringDocumentsCache !== null) {
        return expiringDocumentsCache;
      }

      const response = await api.get("/documents/expiring?days=30");

      expiringDocumentsCache = response;

      return response;
    },
    [refreshKey]
  );

  const documents = data?.items ?? [];

  function handleRefresh() {
    expiringDocumentsCache = null;
    expiringDocumentsCacheTime = 0;
    setRefreshKey((key) => key + 1);
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-text">
            Documents expiring within 30 days
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            Track upcoming document expirations.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
        <button
          type="button"
          className="btn-secondary"
          onClick={handleRefresh}
          disabled={loading}
        >
          <RefreshCw
            className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
          />
          Refresh
        </button>

          <Link
            to="/documents"
            className="text-sm font-medium text-accent hover:underline"
          >
            View all
          </Link>
        </div>
      </div>

      {loading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Loading documents...
        </p>
      ) : error ? (
        <div className="py-6 text-center">
          <p className="text-sm text-red-600">
            Failed to load expiring documents.
          </p>
          <button
            type="button"
            onClick={handleRefresh}
            className="mt-2 text-sm font-medium text-accent hover:underline"
          >
            Try again
          </button>
        </div>
      ) : documents.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Nothing expiring soon.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="px-3 py-3 font-medium">Worker ID</th>
                <th className="px-3 py-3 font-medium">Name</th>
                <th className="px-3 py-3 font-medium">Document</th>
                <th className="px-3 py-3 font-medium">Expiry date</th>
              </tr>
            </thead>

            <tbody>
              {documents.slice(0, 8).map((document) => {
                const daysLeft = document.daysLeft;

                const expiryDate = document.expiry
                  ? new Date(document.expiry).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      timeZone: "Asia/Dubai",
                    })
                  : "—";

                return (
                  <tr
                    key={`${document.workerId}-${document.type}-${document.expiry}`}
                    className="border-b border-border last:border-0 transition-colors hover:bg-paper"
                  >
                    <td className="px-3 py-3">
                      <Link
                        to={`/workers/${document.workerId}`}
                        className="font-medium text-accent hover:underline"
                      >
                        {document.workerCode || document.workerId}
                      </Link>
                    </td>

                    <td className="px-3 py-3 text-foreground">
                      {document.name}
                    </td>

                    <td className="px-3 py-3 text-foreground">
                      {DOC_LABELS?.[document.type] || document.type}
                    </td>

                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{expiryDate}</span>

                        {Number.isFinite(daysLeft) && (
                          <span
                            className={`rounded-full px-2 py-1 text-xs font-medium ${
                                daysLeft < 0
                                  ? "bg-danger-soft text-danger"
                                  : daysLeft <= 7
                                    ? "bg-accent-soft text-accent-dark"
                                    : "bg-paper text-text-muted"
                              }`}
                          >
                            {daysLeft < 0
                              ? "Expired"
                              : daysLeft === 0
                                ? "Expires today"
                                : `${daysLeft} days left`}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
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

    api.get("/workers?page=1&pageSize=1"),
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

  return (
    <div className="space-y-6">
      {/* Dashboard heading */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-text">
          Dashboard
        </h1>

        <div className="flex gap-2">
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

        <StatCard
          label="Total workers"
          value={loading ? "…" : data?.workersCount ?? "—"}
          icon={Users}
        />
      </div>

      {/* Monthly company cards */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-text">
            {formatMonth(month)} Overview
          </h2>

          <p className="mt-1 text-sm text-text-muted">
              Overall hours and report downloads
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

      {adding && (
        <AddCompanyModal
          onClose={() => setAdding(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
