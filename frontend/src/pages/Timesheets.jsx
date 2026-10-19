import { useState } from "react";
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

import { api, qs } from "../api/client.js";
import { useFetch, fmtMonth } from "../hooks.js";
import {
  getCachedCompanies,
  getCachedTimesheets,
  invalidateTimesheetCaches,
} from "../utils/timesheetCache.js";

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString();
}

export default function Timesheets() {
  const [companyId, setCompanyId] = useState("");
  const [status, setStatus] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [month, setMonth] = useState("");

  const refreshData = () => {
    invalidateTimesheetCaches();
    setRefreshKey((key) => key + 1);
  };

  const companiesQuery = useFetch(
    () =>
      getCachedCompanies(async () => {
        const response = await api.get("/companies");
        return response.companies || [];
      }),
    [refreshKey]
  );

const { data, error, loading } = useFetch(
  () => {
    const query = qs({
      companyId,
      status,
      month,
      pageSize: 20,
    });

    return getCachedTimesheets(
      `/timesheets${query}`,
      () => api.get(`/timesheets${query}`)
    );
  },
  [companyId, status, month, refreshKey]
);

  const companies = companiesQuery.data || [];
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
      {companiesQuery.error && (
        <p role="alert" className="mb-4 text-sm text-danger">
          Failed to load companies:{" "}
          {companiesQuery.error.message || "Unknown error"}
        </p>
      )}

      {error && (
        <p role="alert" className="mb-4 text-sm text-danger">
          {error.message || "Failed to load timesheets."}
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
          {["PROCESSING", "ACTIVE", "SUPERSEDED", "FAILED"].map((item) => (
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
                <th className="px-3 py-3 font-medium">File</th>
                <th className="px-3 py-3 font-medium">Uploaded</th>
                <th className="px-3 py-3 font-medium">By</th>
                <th className="px-3 py-3 font-medium">Records</th>
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
                    {upload.originalFilename || upload.fileName || "—"}
                  </td>
                  <td className="px-3 py-3 text-text-muted">
                    {formatDate(upload.uploadedAt || upload.createdAt)}
                  </td>
                  <td className="px-3 py-3 text-text-muted">
                    {upload.uploadedBy?.name || "—"}
                  </td>
                  <td className="px-3 py-3 tabular-nums text-text-muted">
                    {upload.rowCount ?? 0}
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
          onDone={() => {
            setShowUpload(false);
            refreshData();
          }}
        />
      )}
    </Card>
  );
}