import { useState } from "react";
import { Link } from "react-router-dom";
import { Building2, FileSpreadsheet, FileText,LoaderCircle } from "lucide-react";


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

export default function CompanyMonthlyCard({ company, month }) {
  const [downloading, setDownloading] = useState(false);
  const workerCount = company.activeWorkerCount ?? "—";
  const { totalHours = 0, grossPay, remainingPay } = company;

  async function handleDownload(event, format) {
    event.preventDefault();
    event.stopPropagation();

    if (downloading) return;

    setDownloading(true);

    try {
      await downloadCompanyReport(
        company.id,
        month,
        format,
        company.code
      );
    } catch (err) {
      window.alert(err.message || "Unable to download the report.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Link
      to={`/companies/${company.id}`}
      className="group block rounded-xl border border-border bg-surface p-4 transition-colors hover:border-accent hover:bg-surface"
    >
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

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <p className="text-sm text-text-muted">Active Workers</p>
          <p className="font-semibold text-text">{workerCount}</p>
        </div>

        <div>
          <p className="text-sm text-text-muted">Total hours</p>
          <p className="font-semibold tabular-nums text-text">
            { totalHours.toLocaleString()}
          </p>
        </div>

        <div>
          <p className="text-sm text-text-muted">Gross pay</p>
          <p className="font-semibold tabular-nums text-text">
            {  formatAED(grossPay)}
          </p>
        </div>

        <div>
          <p className="text-sm text-text-muted">Remaining pay</p>
          <p
            className={`font-semibold tabular-nums ${
              Number(remainingPay ?? 0) <= 0
                ? "text-green-600"
                : "text-text"
            }`}
          >
            {  formatAED(remainingPay)}
          </p>
        </div>
      </div>

      <div className="mt-4 flex gap-2 border-t border-border pt-3">
        <button
          type="button"
          disabled={downloading}
          onClick={(event) => handleDownload(event, "excel")}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:border-accent hover:bg-accent-soft/30"
        >
          {downloading ? (
          <LoaderCircle className="h-4 w-4 animate-spin" />
        ) : (
          <FileSpreadsheet className="h-4 w-4" />
        )}

        {downloading ? "Preparing..." : "Excel"}
        </button>

        <button
          type="button"
          disabled={downloading}
          onClick={(event) => handleDownload(event, "pdf")}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:border-accent hover:bg-accent-soft/30"
        >
          {downloading ? (
          <LoaderCircle className="h-4 w-4 animate-spin" />
        ) : (
          <FileText className="h-4 w-4" />
        )}

        {downloading ? "Preparing..." : "PDF"}
        </button>
      </div>
    </Link>
  );
}