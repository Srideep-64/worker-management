import { useEffect, useState } from "react";
import {
  Download,
  FileSpreadsheet,
  RefreshCw,
  TriangleAlert,
  Upload,
} from "lucide-react";

import Card from "../components/ui/Card.jsx";
import Badge from "../components/ui/Badge.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";
import UploadModal from "../components/timesheets/UploadModal.jsx";

import { api, qs,invalidate } from "../api/client.js";
import { useFetch, fmtMonth } from "../hooks.js";

function formatDateTime(value) {
  if (!value) return "—";

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

// One short audit trail per row: what the import did, or why it didn't.
function AuditCell({ upload }) {
  const lines = [];

  if (upload.status === "ACTIVE" || upload.status === "SUPERSEDED") {
    if (upload.recordsCreated != null) {
      lines.push(
        `${upload.recordsCreated} created` +
          (upload.recordsConverted
            ? ` · ${upload.recordsConverted} from manual`
            : ""),
      );
    }
    if (upload.confirmedAt) {
      lines.push(`Imported ${formatDateTime(upload.confirmedAt)}`);
    }
  }

  if (upload.status === "SUPERSEDED") {
    const by = upload.supersededBy;
    lines.push(
      by
        ? `Replaced ${formatDateTime(by.confirmedAt || by.uploadedAt)}` +
            (by.uploadedBy?.name ? ` by ${by.uploadedBy.name}` : "")
        : "Replaced by a newer upload",
    );
  }

  if (upload.status === "PROCESSING") lines.push("Awaiting confirmation");
  if (upload.status === "CANCELLED") lines.push("Cancelled before import");
  if (upload.status === "NO_CHANGES") {
    lines.push("Identical to the active timesheet");
  }
  if (upload.status === "FAILED") {
    lines.push(
      `${upload.errorCount ?? 0} validation issue${upload.errorCount === 1 ? "" : "s"}`,
    );
  }

  if (lines.length === 0) return <span>—</span>;

  return (
    <div className="space-y-0.5 text-xs leading-snug">
      {lines.map((line) => (
        <div key={line}>{line}</div>
      ))}
    </div>
  );
}

export default function Timesheets() {
  const [companyId, setCompanyId] = useState("");
  const [status, setStatus] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [month, setMonth] = useState("");
  const [notice, setNotice] = useState("");

  // Success message after an import; clears itself.
  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(""), 8000);
    return () => clearTimeout(timer);
  }, [notice]);

  const refreshData = () => {
  invalidate("/timesheets");
  setRefreshKey((key) => key + 1);
};

// An upload rewrites attendance, so everything built from it is stale.
const handleUploaded = (summary) => {
  invalidate("/timesheets", "/companies", "/workers", "/dashboard");
  setRefreshKey((key) => key + 1);

  if (summary) {
    const created = summary.workRecordsCreated ?? 0;
    const converted = summary.workRecordsConvertedFromManual ?? 0;
    setNotice(
      `Timesheet imported: ${created} record${created === 1 ? "" : "s"} created` +
        (converted > 0
          ? `, ${converted} manual record${converted === 1 ? "" : "s"} re-labelled as timesheet`
          : "") +
        (summary.supersededUploadId ? ". The previous timesheet was superseded." : "."),
    );
  }
};

const companiesQuery = useFetch(() => api.get("/companies"), [refreshKey]);

const { data, error, loading } = useFetch(
  () => api.get(`/timesheets${qs({ companyId, status, month, pageSize: 20 })}`),
  [companyId, status, month, refreshKey],
);

const companies = companiesQuery.data?.companies || [];
  const uploads = data?.uploads || [];

  return (
    <Card
      title="Timesheets"
      action={
        <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn-secondary inline-flex items-center gap-2"
          onClick={refreshData}
          disabled={loading || companiesQuery.loading}
        >
          <RefreshCw
            className={`h-4 w-4 ${
              loading || companiesQuery.loading ? "animate-spin" : ""
            }`}
          />
          {loading || companiesQuery.loading ? "Refreshing…" : "Refresh"}
        </button>

          <button
            type="button"
            className="btn-accent inline-flex items-center gap-2"
            onClick={() => setShowUpload(true)}
            disabled={companiesQuery.loading || companies.length === 0}
          >
            <Upload className="h-4 w-4" />
            Upload timesheet
          </button>
        </div>
      }
    >
      {notice && (
        <p
          role="status"
          className="mb-4 flex items-center justify-between gap-3 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
        >
          <span>{notice}</span>
          <button
            type="button"
            className="text-xs underline"
            onClick={() => setNotice("")}
          >
            Dismiss
          </button>
        </p>
      )}

      {companiesQuery.error && (
        <p role="alert" className="mb-4 text-sm text-danger">
          Failed to load companies:{" "}
          {companiesQuery.error || "Unknown error"}
        </p>
      )}

      {error && (
        <p role="alert" className="mb-4 text-sm text-danger">
          {error || "Failed to load timesheets."}
        </p>
      )}

      <div className="mb-5 flex flex-wrap gap-3">
        <select
          className="input w-auto"
          value={companyId}
          onChange={(event) => setCompanyId(event.target.value)}
          aria-label="Filter timesheets by company"
        >
          <option value="">All companies</option>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.code} — {company.name}
            </option>
          ))}
        </select>

        <input
          type="month"
          className="input w-auto"
          value={month}
          onChange={(event) => setMonth(event.target.value)}
          aria-label="Filter timesheets by month"
        />

        <select
          className="input w-auto"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          aria-label="Filter timesheets by status"
        >
          <option value="">All statuses</option>
          {["PROCESSING", "ACTIVE", "SUPERSEDED", "FAILED", "CANCELLED", "NO_CHANGES"].map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-text-muted">
          Loading timesheets…
        </p>
      ) : uploads.length === 0 ? (
        <EmptyState
          icon={FileSpreadsheet}
          title="No timesheets found"
          description="Try changing the filters or upload a monthly Excel file to get started."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
                <th className="px-3 py-3 font-medium">Company</th>
                <th className="px-3 py-3 font-medium">Month</th>
                <th className="px-3 py-3 font-medium">Uploaded</th>
                <th className="px-3 py-3 font-medium">By</th>
                <th className="px-3 py-3 font-medium">Records</th>
                <th className="px-3 py-3 font-medium">Audit</th>
                <th className="px-3 py-3 font-medium">Errors</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium text-right">Source</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-border">
              {uploads.map((upload) => (
                <tr key={upload.id}>
                  <td className="px-3 py-3 font-medium text-text">
                    {upload.company?.name || upload.company?.code || "—"}
                  </td>
                  <td className="px-3 py-3 text-text-muted">
                    {upload.periodMonth ? fmtMonth(upload.periodMonth) : "—"}
                  </td>
                  <td className="px-3 py-3 text-text-muted">
                    {formatDateTime(upload.uploadedAt || upload.createdAt)}
                  </td>
                  <td className="px-3 py-3 text-text-muted">
                    {upload.uploadedBy?.name || "—"}
                  </td>
                  <td className="px-3 py-3 tabular-nums text-text-muted">
                    {upload.rowCount ?? 0}
                  </td>
                  <td className="px-3 py-3 text-text-muted">
                    <AuditCell upload={upload} />
                  </td>
                  <td className="px-3 py-3 tabular-nums text-text-muted">
                    {upload.errorCount ?? 0}
                  </td>
                  <td className="px-3 py-3">
                    <Badge status={upload.status} />
                  </td>
                  <td className="px-3 py-3 text-right">
                    <a
                      className="inline-flex items-center gap-1 text-accent-dark hover:underline"
                      href={`/api/timesheets/${encodeURIComponent(upload.id)}/source`}
                      title={upload.originalFilename || undefined}
                    >
                      <Download className="h-3.5 w-3.5" />
                      Source
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showUpload && (
        <UploadModal
          companies={companies}
          onClose={() => setShowUpload(false)}
          onDone={(summary) => {
            setShowUpload(false);
            handleUploaded(summary);
          }}
        />
      )}
    </Card>
  );
}