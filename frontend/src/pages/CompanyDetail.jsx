import { useState } from "react";
import { Link, useParams } from "react-router-dom";
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

const TABS = ["Workers", "Monthly stats"];

function WorkersTab({ workers, companyId, month,setMonth}) {

  const [refreshKey, setRefreshKey] = useState(0);

  const { data, error, loading } = useFetch(
    async () => {
      const results = await Promise.all(
        workers.map(async (worker) => {
          try {
            const response = await api.get(
              `/workers/${worker.id}/work?month=${month}`
            );

            return {
              workerId: worker.id,
              totalHours: response.summary?.totalHours ?? 0,
              absentDays: response.summary?.absentDays ?? 0,
              failed: false,
            };
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
            className="btn-secondary"
            onClick={() => setRefreshKey((key) => key + 1)}
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
                      className="text-accent-dark hover:underline"
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

  const {
    data,
    error,
    loading,
  } = useFetch(
    () => api.get(`/companies/${companyId}/stats?month=${month}`),
    [companyId, month,refreshKey]
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

        <input
          id="stats-month"
          type="month"
          className="input w-auto"
          value={month}
          onChange={(event) => {
            if (event.target.value) {
              setMonth(event.target.value);
            }
          }}
        />
      </div>

      <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setRefreshKey((key) => key + 1)}
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
  const [activeTab, setActiveTab] = useState(TABS[0]);

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

  const { data, error, loading } = useFetch(async () => {
    const [companyResponse, workerResponse] = await Promise.all([
      api.get(`/companies/${companyId}`),
      api.get(`/workers?companyId=${encodeURIComponent(companyId)}&pageSize=100`),
    ]);

    const company = companyResponse.company || companyResponse;
    const workers = workerResponse.workers || [];

    return {
      company,
      workers,
    };
  }, [companyId]);

  const company = data?.company;

  return (
    <div className="space-y-4">
      <Link
        to="/companies"
        className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text"
      >
        <ChevronLeft className="h-4 w-4" />
        Companies
      </Link>

      <Card
        title={
          company
            ? `${company.code} — ${company.name}`
            : "Company details"
        }
      >
        {loading && (
          <p className="py-6 text-center text-sm text-text-muted">
            Loading company...
          </p>
        )}

        {error && (
          <p role="alert" className="mb-4 text-sm text-danger">
            {error.message || "Failed to load company details."}
          </p>
        )}

        {data && (
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

          <div className={activeTab === "Workers" ? "" : "hidden"}>
            <WorkersTab
              workers={data.workers}
              companyId={companyId}
              month={month}
              setMonth={setMonth}
            />
          </div>

          <div className={activeTab === "Monthly stats" ? "" : "hidden"}>
            <MonthlyStats
              companyId={companyId}
              companyCode={company.code}
              month={month}
              setMonth={setMonth}
            />
          </div>
          </>
        )}
      </Card>
    </div>
  );
}