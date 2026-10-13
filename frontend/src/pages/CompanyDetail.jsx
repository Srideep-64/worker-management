import { useState, useEffect } from "react";
import { Link, useParams,useLocation } from "react-router-dom";
import {
  ChevronLeft,
  Users,
  FileSpreadsheet,
  FileText,
  RefreshCw,
} from "lucide-react";

import Card from "../components/ui/Card.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";
import { api } from "../api/client.js";
import { useFetch } from "../hooks.js";
import { setCachedWork } from "../utils/workCache.js";

import {
  getWorkerSummary,
  setWorkerSummary,
  invalidateWorkerSummaries,
} from "../utils/companyCache.js";

import {
  getMonthlyStats,
  setMonthlyStats,
  invalidateMonthlyStats,
} from "../utils/companyCache.js";

import {
  getCachedCompanyDetails,
  setCachedCompanyDetails,
  getCachedCompanyWorkers,
  setCachedCompanyWorkers,
} from "../utils/companyDetailCache.js";

const companyDetailsCache = new Map();
const companyWorkersCache = new Map();

function getCachedRequest(cache, key, fetcher) {
  const existing = cache.get(key);

  // Reuse cached data or an in-flight request indefinitely.
  if (existing) {
    return existing.promise;
  }

  const entry = { promise: null };

  entry.promise = Promise.resolve()
    .then(fetcher)
    .catch((error) => {
      if (cache.get(key) === entry) {
        cache.delete(key);
      }
      throw error;
    });

  cache.set(key, entry);
  return entry.promise;
}

const TABS = [ "Monthly stats","Workers"];

function WorkersTab({
  workers,
  companyId,
  month,
  setMonth,
  page,
  setPage,
  hasNextPage,
  workersLoading,
}) {


const [refreshKey, setRefreshKey] = useState(0);

const { data, error, loading } = useFetch(
  async () => {
    const results = await Promise.all(
      workers.map(async (worker) => {
        const cacheKey = `${companyId}:${month}:${worker.id}`;
        const cached = getWorkerSummary(cacheKey);

        if (cached) {
          return cached;
        }

        try {
          const response = await api.get(
            `/workers/${worker.id}/work?month=${month}`
          );

          setCachedWork(worker.id, month, response);

          const summary = {
            workerId: worker.id,
            totalHours: response.summary?.totalHours ?? 0,
            absentDays: response.summary?.absentDays ?? 0,
            failed: false,
          };

          setWorkerSummary(cacheKey, summary);
          return summary;
        } catch {
          return {
            workerId: worker.id,
            failed: true,
          };
        }
      })
    );

    return results;
  },
  [companyId, workers, month, refreshKey]
);


  const hoursByWorker = new Map(
    (data || []).map((item) => [item.workerId, item])
  );

  if (workers.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No workers in this company yet"
        description="Workers assigned to this company will appear here."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium text-text">
          Monthly worker attendance
        </p>

        <div className="flex flex-wrap items-center gap-2">

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-secondary px-2 min-w-0"
            aria-label="Previous month"
            onClick={() => {
        const [year, monthNumber] = month.split("-").map(Number);
        const date = new Date(year, monthNumber - 2, 1);

              setMonth(
                `${date.getFullYear()}-${String(
                  date.getMonth() + 1
                ).padStart(2, "0")}`
              );
            }}
          >
            Previous
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
            className="btn-secondary px-2 min-w-0"
            aria-label="Next month"
            onClick={() => {
              const [year, monthNumber] = month.split("-").map(Number);
              const date = new Date(year, monthNumber, 1);

              setMonth(
                `${date.getFullYear()}-${String(
                  date.getMonth() + 1
                ).padStart(2, "0")}`
              );
            }}
          >
            Next
          </button>
        </div>


          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              invalidateWorkerSummaries(companyId, month);
              setRefreshKey((key) => key + 1);
            }}
            disabled={loading}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error.message || "Unable to load worker statistics."}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
              <th className="px-3 py-2 font-medium">Worker ID</th>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Job title</th>
              <th className="px-3 py-2 font-medium">
                Work hours
              </th>
              <th className="px-3 py-2 font-medium">
                Absent days
              </th>
            </tr>
          </thead>

          <tbody>
            {workers.map((worker) => {
              const stats = hoursByWorker.get(worker.id);

              const unavailable = stats?.failed;

              return (
                <tr
                  key={worker.id}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-3 py-2.5 font-medium">
                    <Link
                      to={`/workers/${worker.id}`}
                      state={{
                        returnTo: `/companies/${companyId}`,
                        returnLabel: "Company Details",
                        returnTab: "Workers",
                      }}
                      className="font-medium text-accent hover:underline"
                    >
                      {worker.workerCode}
                    </Link>
                  </td>

                  <td className="px-3 py-2.5 text-text">
                    {worker.name}
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
            disabled={!hasNextPage || workersLoading}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}


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

  const monthName = new Date(`${month}-01T12:00:00`)
    .toLocaleDateString("en-US", {
      month: "short",
      timeZone: "Asia/Dubai",
    });

  const year = month.slice(0, 4);

  const monthLabel = `${monthName}-${year}`;

  link.download =
    format === "excel"
      ? `${companyCode}-timesheet-${monthLabel}.xlsx`
      : `${companyCode}-payroll-${monthLabel}.pdf`;


  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}


function MonthlyStats({ companyId,companyCode,month,setMonth}) {

  const [downloading, setDownloading] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  async function handleDownload(format) {
    setDownloading(format);
    setDownloadError("");

    try {
      await downloadCompanyReport(companyId, month, format,companyCode);
    } catch (err) {
      setDownloadError(
        err.message || "Unable to download the report."
      );
    } finally {
      setDownloading("");
    }
  }

const statsCacheKey = `${companyId}:${month}`;

const {
  data,
  error,
  loading,
} = useFetch(
  async () => {
    // Use cached data only during normal loading, not on refresh.
    if (refreshKey === 0) {
      const cached = getMonthlyStats(statsCacheKey);
      if (cached) return cached;
    }

    const response = await api.get(
      `/companies/${companyId}/stats?month=${month}`
    );

    setMonthlyStats(statsCacheKey, response);
    return response;
  },
  [companyId, month, refreshKey]
);

  const summary = data?.summary;

    const payroll = data?.payrollSummary;

    const formatAED = (value) =>
      new Intl.NumberFormat("en-AE", {
        style: "currency",
        currency: "AED",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value ?? 0);

    const payrollCards = [
      ["Gross pay", payroll?.grossPay],
      ["Absence deductions", payroll?.absenceDeductions],
      ["Net pay", payroll?.netPay],
      ["Total advances", payroll?.totalAdvances],
      ["Remaining pay", payroll?.remainingPay],
    ];

  const statCards = [
    ["Total hours", summary?.totalHours],
    ["Workers", data?.workersWithRecords],
    ["Worked days", summary?.workedDays],
    ["Absent days", summary?.absentDays],
    ["Holidays", summary?.holidays],
    ["Weekly offs", summary?.weeklyOffs],
  ];

  const hasRecords = (data?.workersWithRecords ?? 0) > 0;

  return (
    <div className="space-y-4">

    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <label
          htmlFor="stats-month"
          className="mb-1 block text-sm font-medium text-text"
        >
          Reporting month
        </label>


        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-secondary px-2 min-w-0"
            aria-label="Previous month"
            onClick={() => {
              const [year, monthNumber] = month.split("-").map(Number);
              const date = new Date(year, monthNumber - 2, 1);

              setMonth(
                `${date.getFullYear()}-${String(
                  date.getMonth() + 1
                ).padStart(2, "0")}`
              );
            }}
          >
            Previous
          </button>

          <input
            type="month"
            aria-label="Select month"
            className="btn-secondary px-2 min-w-0"
            value={month}
            onChange={(event) => {
              if (event.target.value) {
                setMonth(event.target.value);
              }
            }}
          />

          <button
            type="button"
            className="btn-secondary px-2 min-w-0"
            aria-label="Next month"
            onClick={() => {
              const [year, monthNumber] = month.split("-").map(Number);
              const date = new Date(year, monthNumber, 1);

              setMonth(
                `${date.getFullYear()}-${String(
                  date.getMonth() + 1
                ).padStart(2, "0")}`
              );
            }}
          >
            Next
          </button>
        </div>

      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-secondary px-2 min-w-0 gap-1"
          onClick={() => {
            invalidateMonthlyStats(companyId, month);
            setRefreshKey((key) => key + 1);
          }}
          disabled={loading}

        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>

        <button
          type="button"
          className="btn-secondary"
          disabled={Boolean(downloading)}
          onClick={() => handleDownload("excel")}
        >
          <FileSpreadsheet className="h-4 w-4" />
          {downloading === "excel"
            ? "Downloading Excel..."
            : "Download Excel"}
        </button>

        <button
          type="button"
          className="btn-primary"
          disabled={Boolean(downloading)}
          onClick={() => handleDownload("pdf")}
        >
          <FileText className="h-4 w-4" />
          {downloading === "pdf"
            ? "Downloading PDF..."
            : "Download PDF"}
        </button>
      </div>
    </div>

    {downloadError && (
      <p role="alert" className="text-sm text-danger">
        {downloadError}
      </p>
    )}


      {error && (
        <p role="alert" className="text-sm text-danger">
          {error.message || "Unable to load monthly statistics."}
        </p>
      )}

      {loading && (
        <p className="py-6 text-center text-sm text-text-muted">
          Loading monthly statistics...
        </p>
      )}

      {!loading && !error && data && !hasRecords && (
        <EmptyState
          title="No records for this month"
          description="There are no manual or timesheet work records for this month."
        />
      )}

      {!loading && !error && data && hasRecords && summary && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {statCards.map(([label, value]) => (
              <div
                key={label}
                className="rounded-md border border-border px-3 py-3"
              >
                <p className="text-xs uppercase tracking-wide text-text-muted">
                  {label}
                </p>

                <p className="mt-1 text-lg font-semibold tabular-nums text-text">
                  {value ?? "—"}
                </p>
              </div>
            ))}
          </div>

          
        {payroll && (
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-text">
                Monthly payroll
              </h3>

              {payroll.workersWithoutRate > 0 && (
                <p className="text-xs text-text-muted">
                  {payroll.workersWithoutRate} worker(s) without an hourly rate
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {payrollCards.map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-md border border-border px-3 py-3"
                >
                  <p className="text-xs uppercase tracking-wide text-text-muted">
                    {label}
                  </p>

                  <p
                    className={`mt-1 text-lg font-semibold tabular-nums ${
                      label === "Remaining pay" &&
                      Number(value ?? 0).toFixed(2) === "0.00"
                        ? "text-green-600"
                        : "text-text"
                    }`}
                  >
                    {formatAED(value)}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}


          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {[
              ["Hours by role", summary.byRole || []],
            ].map(([title, rows]) => (
              <section key={title}>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
                  {title}
                </h3>

                {rows.length === 0 ? (
                  <p className="text-sm text-text-muted">
                    No records available.
                  </p>
                ) : (
                  <ul className="space-y-2 text-sm">
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
              </section>
            ))}
          </div>

          {data.activeUpload ? (
            data.activeUpload.originalFilename && (
              <p className="text-xs text-text-muted">
                Source: {data.activeUpload.originalFilename}
              </p>
            )
          ) : (
            <p className="text-xs text-text-muted">
              Source: Manual work records
            </p>
          )}
        </>
      )}
    </div>
  );
}


export default function CompanyDetail() {
  const { companyId } = useParams();
  const location = useLocation();

  const [activeTab, setActiveTab] = useState(
    location.state?.activeTab || "Monthly stats"
  );

  const PAGE_SIZE = 15;
  const [workerPage, setWorkerPage] = useState(1);

  const [month, setMonth] = useState(() => {
    const now = new Date();
    const previousMonth = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1
    );

    return `${previousMonth.getFullYear()}-${String(
      previousMonth.getMonth() + 1
    ).padStart(2, "0")}`;
  });

  useEffect(() => {
    setWorkerPage(1);
  }, [companyId]);

    const {
      data: companyData,
      error: companyError,
      loading: companyLoading,
    } = useFetch(async () => {
      const cached = getCachedCompanyDetails(companyId);

      if (cached) return cached;

      const data = await api.get(`/companies/${companyId}`);
      setCachedCompanyDetails(companyId, data);

      return data;
    }, [companyId]);

    const {
      data: workerData,
      error: workerError,
      loading: workersLoading,
    } = useFetch(async () => {
      const cached = getCachedCompanyWorkers(
        companyId,
        workerPage,
        PAGE_SIZE
      );

      if (cached) return cached;

      const data = await api.get(
        `/workers?companyId=${encodeURIComponent(companyId)}` +
          `&page=${workerPage}&pageSize=${PAGE_SIZE}`
      );

      setCachedCompanyWorkers(companyId, workerPage, PAGE_SIZE, data);

      return data;
    }, [companyId, workerPage]);

  const company = companyData?.company || companyData;
  const workers = workerData?.workers || [];

  const pagination =
    workerData?.pagination || workerData?.meta || {};

  const totalWorkers =
    pagination.total ??
    workerData?.total ??
    workerData?.totalCount;

  const hasNextPage =
    pagination.hasNextPage ??
    workerData?.hasNextPage ??
    (totalWorkers != null
      ? workerPage * PAGE_SIZE < totalWorkers
      : workers.length === PAGE_SIZE);

  return (
    <div className="space-y-4">
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text"
      >
        <ChevronLeft className="h-4 w-4" />
        Dashboard
      </Link>

      <Card
        title={
          company
            ? `${company.code} — ${company.name}`
            : "Company details"
        }
      >
        {companyLoading && (
          <p className="py-6 text-center text-sm text-text-muted">
            Loading company...
          </p>
        )}

        {(companyError || workerError) && (
          <p role="alert" className="mb-4 text-sm text-danger">
            {(companyError || workerError).message ||
              "Failed to load company details."}
          </p>
        )}

        {company && (
          <>
            <div
              role="tablist"
              aria-label="Company information"
              className="mb-5 flex gap-1 overflow-x-auto border-b border-border"
            >
              {TABS.map((tab) => {
                const selected = activeTab === tab;

                return (
                  <button
                    key={tab}
                    id={`company-tab-${tab}`}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setActiveTab(tab)}
                    className={`shrink-0 px-3 pb-3 text-sm font-medium transition-colors ${
                      selected
                        ? "border-b-2 border-accent text-text"
                        : "text-text-muted hover:text-text"
                    }`}
                  >
                    {tab}
                  </button>
                );
              })}
            </div>

            {activeTab === "Workers" && (
              <>
                {workersLoading ? (
                  <p className="py-6 text-center text-sm text-text-muted">
                    Loading workers...
                  </p>
                ) : (
                  <WorkersTab
                    workers={workers}
                    companyId={companyId}
                    month={month}
                    setMonth={setMonth}
                    page={workerPage}
                    setPage={setWorkerPage}
                    hasNextPage={hasNextPage}
                    workersLoading={workersLoading}
                  />
                )}
              </>
            )}

            {activeTab === "Monthly stats" && (
              <MonthlyStats
                companyId={companyId}
                companyCode={company.code}
                month={month}
                setMonth={setMonth}
              />
            )}
          </>
        )}
      </Card>
    </div>
  );
}
