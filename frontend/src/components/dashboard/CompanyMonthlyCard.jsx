import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Banknote,
  Clock3,
  FileSpreadsheet,
  FileText,
  Layers3,
  LoaderCircle,
  Minus,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";

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

function formatHours(value) {
  return Number(value ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
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
  const monthLabel = formatMonth(month).replace(" ", "-");

  link.href = objectUrl;
  link.download =
    format === "excel"
      ? `${companyCode}-timesheet-${monthLabel}.xlsx`
      : `${companyCode}-payroll-${monthLabel}.pdf`;

  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export default function CompanyMonthlyCard({ company, month }) {
  const [downloading, setDownloading] = useState(null);
  // Remember which month was toggled so selecting a different month shows AED by default.
  const [trendView, setTrendView] = useState({ month, showPercent: false });
  const { totalHours = 0, grossPay, remainingPay } = company;

  // Each month is averaged over its own fully recorded workers.
  // The backend hides trends when the comparison is not eligible.
  const trendAED = Number(company.averageGrossPayTrendAED);
  const trendPercent = company.averageGrossPayTrendPercent;
  const showTrend =
    company.averageGrossPayTrendAED != null &&
    Number.isFinite(trendAED) &&
    typeof trendPercent === "number" &&
    Number.isFinite(trendPercent);
  const showPercent = trendView.month === month && trendView.showPercent;
  const includedWorkers = company.averageGrossPayTrendWorkerCount;
  const previousIncludedWorkers = company.averageGrossPayTrendPreviousWorkerCount;
  const direction = trendAED > 0 ? 1 : trendAED < 0 ? -1 : 0;
  const TrendIcon = direction > 0 ? TrendingUp : direction < 0 ? TrendingDown : Minus;
  const sign = direction > 0 ? "+" : direction < 0 ? "−" : "";
  const trendText = showTrend
    ? showPercent
      ? `${sign}${Math.abs(trendPercent).toFixed(2)}%`
      : `${sign}${formatAED(Math.abs(trendAED))}`
    : "";
  const trendColor = direction > 0
    ? "text-green-600"
    : direction < 0
      ? "text-red-600"
      : "text-text-muted";

  async function handleDownload(format) {
    if (downloading) return;
    setDownloading(format);

    try {
      await downloadCompanyReport(company.id, month, format, company.code);
    } catch (err) {
      window.alert(err.message || "Unable to download the report.");
    } finally {
      setDownloading(null);
    }
  }
  const buttonClass =
    "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-text transition-colors hover:border-accent hover:bg-accent-soft/30 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <article className="group relative flex h-full flex-col rounded-2xl border border-border bg-surface p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-md">
      {/* Overlay link makes the company card clickable without nesting buttons in a link. */}
      <Link
        to={`/companies/${company.id}`}
        aria-label={`Open ${company.name} details`}
        className="absolute inset-0 z-10 rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      />

      <div className="flex min-h-[42px] items-start gap-3 border-b border-border pb-3">
        <span className="inline-flex min-w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft px-2 py-1.5 text-xs font-bold text-accent">
          {company.code || "—"}
        </span>
        <h3 className="min-w-0 flex-1 truncate pt-1 text-sm font-bold text-text sm:text-[15px]">
          {company.name}
        </h3>
        <ArrowRight className="h-5 w-5 shrink-0 text-accent transition-transform group-hover:translate-x-1" />
      </div>

      <div className="grid grid-cols-2 gap-x-3 border-b border-border py-3">
        <div className="flex min-w-0 items-start gap-2 border-r border-border pr-2">
          <Users className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <div className="min-w-0">
            <p className="text-xs text-text-muted">Active workers</p>
            <p className="mt-0.5 text-lg font-bold tabular-nums text-text">
              {company.activeWorkerCount ?? "—"}
            </p>
          </div>
        </div>
        <div className="flex min-w-0 items-start gap-2 pl-1">
          <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <div className="min-w-0">
            <p className="text-xs text-text-muted">Total hours</p>
            <p className="mt-0.5 text-lg font-bold tabular-nums text-text">
              {formatHours(totalHours)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-3 border-b border-border py-3">
        <div className="flex min-w-0 items-start gap-2 border-r border-border pr-2">
          <Banknote className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="min-w-0">
            <p className="text-xs text-text-muted">Gross pay</p>
            <p className="mt-0.5 text-sm font-bold tabular-nums text-text">
              {formatAED(grossPay)}
            </p>
          </div>
        </div>
        <div className="flex min-w-0 items-start gap-2 pl-1">
          <Layers3 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
          <div className="min-w-0">
            <p className="text-xs text-text-muted">Remaining pay</p>
            <p className={`mt-0.5 text-sm font-bold tabular-nums ${Number(remainingPay ?? 0) <= 0 ? "text-green-600" : "text-text"}`}>
              {formatAED(remainingPay)}
            </p>
          </div>
        </div>
      </div>

      <div className="relative z-20 mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={Boolean(downloading)}
            onClick={() => handleDownload("excel")}
            className={buttonClass}
          >
            {downloading === "excel" ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-4 w-4 text-green-600" />
            )}
            {downloading === "excel" ? "Excel" : "Excel"}
          </button>
  
          <button
            type="button"
            disabled={Boolean(downloading)}
            onClick={() => handleDownload("pdf")}
            className={buttonClass}
          >
            {downloading === "pdf" ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4 text-red-600" />
            )}
            {downloading === "pdf" ? "PDF" : "PDF"}
          </button>
        </div>

        {showTrend && (
          <button
            type="button"
            onClick={() =>
              setTrendView((previous) => ({
                month,
                showPercent: previous.month === month ? !previous.showPercent : true,
              }))
            }
            className="ml-auto min-w-0 shrink-0 rounded-lg px-1 py-1 text-right transition-colors hover:bg-accent-soft/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            
          title={`Avg gross/worker vs previous month. Click for ${showPercent ? "AED" : "%"}.`}
          aria-label={`${trendText} vs previous month. Click for ${showPercent ? "AED" : "%"}.`}
          aria-pressed={showPercent}

          >
            <span className={`flex items-center justify-end gap-1 text-sm font-bold tabular-nums ${trendColor}`}>
              <TrendIcon className="h-4 w-4" aria-hidden="true" />
              <span>{trendText}</span>
            </span>
            <span className="block text-[10px] leading-tight text-text-muted">
              Avg gross / worker
            </span>
            <span className="block text-[10px] leading-tight text-text-muted">
            Click for {showPercent ? "AED" : "%"}
          </span>
          </button>
        )}
      </div>
    </article>
  );
}
