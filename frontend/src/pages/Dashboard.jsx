import { Link } from "react-router-dom";
import {
  Building2,
  Users,
  Briefcase,
  FileSpreadsheet,
} from "lucide-react";

import StatCard from "../components/ui/StatCard.jsx";
import Card from "../components/ui/Card.jsx";
import Badge from "../components/ui/Badge.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";
import ExpiryBadge from "../components/ui/ExpiryBadge.jsx";

import { api } from "../api/client.js";
import { useFetch, fmtMonth, DOC_LABELS } from "../hooks.js";

const QUICK_LINKS = [
  { label: "Upload a timesheet", to: "/timesheets" },
  { label: "Add a worker", to: "/workers" },
  { label: "View companies", to: "/companies" },
];

async function fetchDashboardData() {
  const requests = await Promise.allSettled([
    api.get("/companies"),
    api.get("/workers?page=1&pageSize=1"),
    api.get("/clients?active=true"),
    api.get("/timesheets?page=1&pageSize=5"),
    api.get("/documents/expiring?days=30"),
  ]);

  const [companiesResult, workersResult, clientsResult, uploadsResult, expiringResult] =
    requests;

  const failedSections = [];

  function getValue(result, section, fallback) {
    if (result.status === "fulfilled") {
      return result.value;
    }

    failedSections.push(section);
    return fallback;
  }

  const companiesData = getValue(
    companiesResult,
    "Companies",
    { companies: [], pagination: null }
  );

  const workersData = getValue(
    workersResult,
    "Workers",
    { workers: [], pagination: null }
  );

  const clientsData = getValue(
    clientsResult,
    "Clients",
    { clients: [] }
  );

  const uploadsData = getValue(
    uploadsResult,
    "Timesheet uploads",
    { uploads: [], timesheets: [] }
  );

  const expiringData = getValue(
    expiringResult,
    "Expiring documents",
    { items: [] }
  );

  const companies = companiesData.companies || [];
  const workers = workersData.workers || [];
  const clients = clientsData.clients || [];
  const uploads = uploadsData.uploads || uploadsData.timesheets || [];
  const expiring = expiringData.items || [];

  return {
    companiesCount:
      companiesData.pagination?.total ??
      companiesData.pagination?.totalCount ??
      companies.length,

    workersCount:
      workersData.pagination?.total ??
      workersData.pagination?.totalCount ??
      workers.length,

    clientsCount: clients.filter((client) => client.active !== false).length,

    uploads,
    expiring,
    failedSections,
  };
}

export default function Dashboard() {
  const { data, error, loading } = useFetch(fetchDashboardData, []);

  const failedSections = data?.failedSections || [];

  return (
    <div className="space-y-6">
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
          Some dashboard information could not be loaded:{" "}
          {failedSections.join(", ")}. Other available information is still
          shown.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Companies"
          value={loading ? "…" : data?.companiesCount ?? "—"}
          icon={Building2}
        />

        <StatCard
          label="Total workers"
          value={loading ? "…" : data?.workersCount ?? "—"}
          icon={Users}
        />

        <StatCard
          label="Active clients"
          value={loading ? "…" : data?.clientsCount ?? "—"}
          icon={Briefcase}
        />

        <StatCard
          label="Recent uploads"
          value={loading ? "…" : data?.uploads.length ?? "—"}
          hint="Latest 5"
          icon={FileSpreadsheet}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Recent timesheet uploads" className="lg:col-span-2">
          {loading ? (
            <p className="py-6 text-center text-sm text-text-muted">
              Loading recent uploads...
            </p>
          ) : data?.uploads.length === 0 ? (
            <EmptyState
              icon={FileSpreadsheet}
              title="No uploads yet"
              description="Upload a monthly Excel file from the Timesheets page."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[540px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
                    <th className="px-3 py-2 font-medium">Company</th>
                    <th className="px-3 py-2 font-medium">Month</th>
                    <th className="px-3 py-2 font-medium">Uploaded by</th>
                    <th className="px-3 py-2 font-medium">Rows</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>

                <tbody>
                  {data?.uploads.map((upload) => (
                    <tr
                      key={upload.id}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-3 py-2.5 font-medium text-text">
                        {upload.company?.code || upload.companyId || "—"}
                      </td>

                      <td className="px-3 py-2.5 text-text-muted">
                        {upload.periodMonth
                          ? fmtMonth(upload.periodMonth)
                          : "—"}
                      </td>

                      <td className="px-3 py-2.5 text-text-muted">
                        {upload.uploadedBy?.name || "—"}
                      </td>

                      <td className="px-3 py-2.5 tabular-nums text-text-muted">
                        {upload.rowCount ?? "—"}
                      </td>

                      <td className="px-3 py-2.5">
                        <Badge status={upload.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Quick links">
          <ul className="space-y-2">
            {QUICK_LINKS.map((link) => (
              <li key={link.to}>
                <Link
                  to={link.to}
                  className="block rounded-md border border-border px-3 py-2.5 text-sm font-medium text-text transition-colors hover:border-accent hover:bg-accent-soft/40"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card
        title="Documents expiring within 30 days"
        action={
          <Link
            to="/documents"
            className="text-sm text-accent-dark hover:underline"
          >
            View all
          </Link>
        }
      >
        {loading ? (
          <p className="py-6 text-center text-sm text-text-muted">
            Checking document expiries...
          </p>
        ) : data?.expiring.length === 0 ? (
          <EmptyState
            icon={FileSpreadsheet}
            title="Nothing expiring soon"
            description="No documents are currently listed as expiring within 30 days."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
                  <th className="px-3 py-2 font-medium">Worker ID</th>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Document</th>
                  <th className="px-3 py-2 font-medium">Expiry date</th>
                </tr>
              </thead>

              <tbody>
                {data?.expiring.slice(0, 8).map((document) => (
                  <tr
                    key={`${document.workerId}-${document.type}`}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-3 py-2.5 font-medium">
                      <Link
                        to={`/workers/${document.workerId}`}
                        className="text-accent-dark hover:underline"
                      >
                        {document.workerCode || document.workerId}
                      </Link>
                    </td>

                    <td className="px-3 py-2.5 text-text-muted">
                      {document.name || "—"}
                    </td>

                    <td className="px-3 py-2.5 text-text-muted">
                      {DOC_LABELS[document.type] || document.type || "—"}
                    </td>

                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="tabular-nums text-text-muted">
                          {document.expiry || "—"}
                        </span>

                        {Number.isFinite(document.daysLeft) && (
                          <ExpiryBadge daysLeft={document.daysLeft} />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}