import { useState } from "react";
import {
  AlertTriangle,
  Banknote,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileSpreadsheet,
  FileText,
  Layers3,
  LoaderCircle,
  RefreshCw,
  Users,
  Wallet,
} from "lucide-react";

import EmptyState from "../ui/EmptyState.jsx";
import { api, invalidate } from "../../api/client.js";
import { useFetch } from "../../hooks.js";

function changeMonth(month, delta) {
  const [year, monthNumber] = month.split("-").map(Number);
  const next = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatMonth(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber - 1, 1)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    year: "numeric",
  });
}

function formatAED(value) {
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value ?? 0);
}

function formatNumber(value) {
  if (value === undefined || value === null) return "—";
  return Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 });
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
      message = payload.error?.message || payload.message || message;
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

function Metric({ label, value, icon: Icon, iconColor = "text-accent", highlighted = false, currency = false }) {
  return (
    <div className={`flex min-w-0 items-start gap-3 rounded-xl border p-4 sm:p-5 ${
      highlighted ? "border-accent/40 bg-accent-soft/30" : "border-border bg-surface"
    }`}>
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
        highlighted ? "bg-accent-soft" : "bg-accent-soft/60"
      }`}>
        <Icon className={`h-5 w-5 ${iconColor}`} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-text-muted sm:text-sm">{label}</p>
        <p className={`mt-1 break-words font-bold tabular-nums text-text ${
          currency ? "text-base sm:text-xl" : "text-xl sm:text-2xl"
        }`}>
          {value}
        </p>
      </div>
    </div>
  );
}

function SmallMetric({ label, value }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3.5 sm:p-4">
      <p className="text-xs font-medium text-text-muted">{label}</p>
      <p className="mt-1.5 break-words text-base font-bold tabular-nums text-text sm:text-lg">
        {value}
      </p>
    </div>
  );
}

export default function MonthlyStats({ companyId, companyCode, month, setMonth }) {
  const [downloading, setDownloading] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const { data, error, loading, reload } = useFetch(
    () => api.get(`/companies/${companyId}/stats?month=${encodeURIComponent(month)}`),
    [companyId, month]
  );

  const summary = data?.summary;
  const payroll = data?.payrollSummary;
  const hasRecords = (data?.workersWithRecords ?? 0) > 0;

  async function handleDownload(format) {
    if (downloading) return;
    setDownloading(format);
    setDownloadError("");
    try {
      await downloadCompanyReport(companyId, month, format, companyCode);
    } catch (err) {
      setDownloadError(err.message || "Unable to download the report.");
    } finally {
      setDownloading("");
    }
  }

  async function handleRefresh() {
    if (refreshing || loading) return;
    setRefreshing(true);
    invalidate(`/companies/${companyId}/stats`);
    try {
      await reload();
    } finally {
      setRefreshing(false);
    }
  }

  const buttonClass =
    "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-text transition-colors hover:border-accent hover:bg-accent-soft/30 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="space-y-4">
      {/* Controls above the expanded dashboard-style card */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="stats-month" className="mr-1 text-sm font-semibold text-text">
            Reporting month
          </label>
          <button
            type="button"
            className={`${buttonClass} w-10 px-0`}
            aria-label="Previous month"
            onClick={() => setMonth(changeMonth(month, -1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="relative flex h-10 items-center rounded-lg border border-border bg-surface">
            <input
              id="stats-month"
              type="month"
              aria-label="Select reporting month"
              className="h-full w-[185px] min-w-0 cursor-pointer bg-transparent py-2 pl-3 pr-11 text-sm font-semibold text-text outline-none [color-scheme:light] dark:[color-scheme:dark] [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-y-0 [&::-webkit-calendar-picker-indicator]:right-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-11 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0"
              value={month}
              onChange={(event) => event.target.value && setMonth(event.target.value)}
            />
            <CalendarDays
              aria-hidden="true"
              className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-accent"
            />
          </div>
          <button
            type="button"
            className={`${buttonClass} w-10 px-0`}
            aria-label="Next month"
            onClick={() => setMonth(changeMonth(month, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={buttonClass}
            disabled={loading || refreshing}
            onClick={handleRefresh}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            type="button"
            className={buttonClass}
            disabled={Boolean(downloading)}
            onClick={() => handleDownload("excel")}
          >
            {downloading === "excel" ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-4 w-4 text-green-600" />
            )}
            {downloading === "excel" ? "Preparing..." : "Excel"}
          </button>
          <button
            type="button"
            className={buttonClass}
            disabled={Boolean(downloading)}
            onClick={() => handleDownload("pdf")}
          >
            {downloading === "pdf" ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4 text-red-600" />
            )}
            {downloading === "pdf" ? "Preparing..." : "PDF"}
          </button>
        </div>
      </div>

      {downloadError && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {downloadError}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error || "Unable to load monthly statistics."}
        </p>
      )}
      {loading && (
        <p className="py-8 text-center text-sm text-text-muted">Loading monthly statistics...</p>
      )}
      {!loading && !error && data && !hasRecords && (
        <EmptyState
          title="No records for this month"
          description="There are no manual or timesheet work records for this month."
        />
      )}

      {!loading && !error && data && hasRecords && summary && (
        <article className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-accent-soft/20 px-4 py-4 sm:px-5">
            <div>
              <h3 className="text-base font-bold text-text sm:text-lg">Monthly overview</h3>
              <p className="mt-0.5 text-xs text-text-muted">
                Work records and payroll · {formatMonth(month)}
              </p>
            </div>
            <span className="rounded-lg border border-accent/20 bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent">
              {formatMonth(month)}
            </span>
          </div>

          <div className="space-y-6 p-4 sm:p-5">
            {/* Same four important metrics as a company monthly card, but larger. */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric
                label="Workers with records"
                value={formatNumber(data.workersWithRecords)}
                icon={Users}
              />
              <Metric
                label="Total hours"
                value={formatNumber(summary.totalHours)}
                icon={Clock3}
              />
              {payroll && (
                <>
                  <Metric
                    label="Gross pay"
                    value={formatAED(payroll.grossPay)}
                    icon={Banknote}
                    iconColor="text-amber-600"
                    currency
                  />
                  <Metric
                    label="Remaining pay"
                    value={formatAED(payroll.remainingPay)}
                    icon={Layers3}
                    iconColor="text-green-600"
                    highlighted
                    currency
                  />
                </>
              )}
            </div>

            <section className="space-y-3">
              <div className="flex items-center gap-2 border-b border-border pb-2">
                <CalendarDays className="h-4 w-4 text-accent" />
                <h4 className="text-sm font-bold text-text">Work summary</h4>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <SmallMetric label="Worked days" value={formatNumber(summary.workedDays)} />
                <SmallMetric label="Absent days" value={formatNumber(summary.absentDays)} />
                <SmallMetric label="Holidays" value={formatNumber(summary.holidays)} />
                <SmallMetric label="Weekly offs" value={formatNumber(summary.weeklyOffs)} />
              </div>
            </section>

            {payroll && (
              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-accent" />
                    <h4 className="text-sm font-bold text-text">Monthly payroll</h4>
                  </div>
                  
                  {payroll.workersWithoutRate > 0 && (
                    <p className="rounded-md border border-amber-500/20 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
                      {payroll.workersWithoutRate} worker(s) without an hourly rate
                    </p>
                  )}

                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <SmallMetric label="Absence deductions" value={formatAED(payroll.absenceDeductions)} />
                  <SmallMetric label="Net pay" value={formatAED(payroll.netPay)} />
                  <SmallMetric label="Total advances" value={formatAED(payroll.totalAdvances)} />
                </div>
              </section>
            )}

          </div>

        </article>
      )}
    </div>
  );
}
