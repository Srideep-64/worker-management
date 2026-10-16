
import { useState } from "react";
import {
  FileSpreadsheet,
  FileText,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Download,
  
} from "lucide-react";

import EmptyState from "../ui/EmptyState.jsx";
import { api } from "../../api/client.js";
import { useFetch } from "../../hooks.js";
import {
  getMonthlyStats,
  setMonthlyStats,
  invalidateMonthlyStats,
} from "../../utils/companyCache.js";


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


  const [forceRefresh, setForceRefresh] = useState(false);

  const statsCacheKey = `${companyId}:${month}`;

  const { data, error, loading, reload } = useFetch(
    async () => {
      if (!forceRefresh) {
        const cached = getMonthlyStats(statsCacheKey);
        if (cached) return cached;
      }

      const response = await api.get(
        `/companies/${companyId}/stats?month=${month}`
      );

      setMonthlyStats(statsCacheKey, response);
      return response;
    },
    [companyId, month, forceRefresh]
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

<div className="flex flex-wrap items-center justify-between gap-4">
  {/* Left: Reporting month and navigation */}
  <div className="flex flex-wrap items-center gap-3">
    <label
      htmlFor="stats-month"
      className="text-sm font-medium text-text whitespace-nowrap leading-none"
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
        <ChevronLeft className="h-4 w-4" />
      </button>

      <input
        id="stats-month"
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
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  </div>

  {/* Right: Refresh and downloads */}
  <div className="flex flex-wrap items-center gap-2">
    <button
      type="button"
      className="btn-secondary px-2 min-w-0 gap-1"
      onClick={async () => {
        invalidateMonthlyStats(companyId, month);
        setForceRefresh(true);
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
      {downloading === "excel" ? "Downloading..." : " Excel"}
    </button>

    <button
      type="button"
      className="btn-secondary"
      disabled={Boolean(downloading)}
      onClick={() => handleDownload("pdf")}
    >
      <FileText className="h-4 w-4" />
      {downloading === "pdf" ? "Downloading..." : "PDF"}
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
                      Number(value ?? 0) <= "0.00"
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

export default MonthlyStats;
