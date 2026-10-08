import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronLeft, Users, Building2 } from "lucide-react";

import Card from "../components/ui/Card.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";
import { api } from "../api/client.js";
import { useFetch } from "../hooks.js";

const TABS = ["Workers", "Clients", "Monthly stats"];

function getCurrentClients(workers = []) {
  const clients = new Map();

  workers.forEach((worker) => {
    const client = worker.currentClient;

    if (!client?.id) return;

    const existing = clients.get(client.id);

    if (existing) {
      existing.count += 1;
    } else {
      clients.set(client.id, {
        ...client,
        count: 1,
      });
    }
  });

  return [...clients.values()];
}

function WorkersTab({ workers }) {
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
    <div className="overflow-x-auto">
      <table className="w-full min-w-[600px] text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
            <th className="px-3 py-2 font-medium">Worker ID</th>
            <th className="px-3 py-2 font-medium">Name</th>
            <th className="px-3 py-2 font-medium">Job title</th>
            <th className="px-3 py-2 font-medium">Nationality</th>
            <th className="px-3 py-2 font-medium">Current client</th>
          </tr>
        </thead>

        <tbody>
          {workers.map((worker) => (
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

              <td className="px-3 py-2.5 text-text-muted">
                {worker.nationality || "—"}
              </td>

              <td className="px-3 py-2.5 text-text-muted">
                {worker.currentClient?.name || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ClientsTab({ clients }) {
  if (clients.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title="No current clients"
        description="No worker in this company has an open client assignment."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
            <th className="px-3 py-2 font-medium">Code</th>
            <th className="px-3 py-2 font-medium">Client</th>
            <th className="px-3 py-2 text-right font-medium">
              Workers assigned
            </th>
          </tr>
        </thead>

        <tbody>
          {clients.map((client) => (
            <tr
              key={client.id}
              className="border-b border-border last:border-0"
            >
              <td className="px-3 py-2.5 font-medium text-text">
                {client.code || "—"}
              </td>

              <td className="px-3 py-2.5 text-text">
                {client.name}
              </td>

              <td className="px-3 py-2.5 text-right tabular-nums text-text-muted">
                {client.count}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MonthlyStats({ companyId }) {
  const now = new Date();

  const [month, setMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  );

  const {
    data,
    error,
    loading,
  } = useFetch(
    () => api.get(`/companies/${companyId}/stats?month=${month}`),
    [companyId, month]
  );

  const summary = data?.summary;

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label
          htmlFor="stats-month"
          className="text-sm font-medium text-text"
        >
          Select month
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

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {[
              ["Hours by client", summary.byClient || []],
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
      clients: getCurrentClients(workers),
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

            {activeTab === "Workers" && (
              <WorkersTab workers={data.workers} />
            )}

            {activeTab === "Clients" && (
              <ClientsTab clients={data.clients} />
            )}

            {activeTab === "Monthly stats" && (
              <MonthlyStats companyId={companyId} />
            )}
          </>
        )}
      </Card>
    </div>
  );
}