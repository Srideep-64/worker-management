import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, Users } from "lucide-react";

import Card from "../components/ui/Card.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";
import Modal from "../components/ui/Modal.jsx";

import { api, qs, ApiError } from "../api/client.js";
import { useFetch, useDebounced } from "../hooks.js";

const PAGE_SIZE = 25;

const INITIAL_FORM = {
  workerCode: "",
  companyId: "",
  name: "",
  nationality: "",
  phone: "",
  jobTitle: "",
  joiningDate: "",
};

function AddWorkerModal({ companies, onClose, onSaved }) {
  const [form, setForm] = useState({
    ...INITIAL_FORM,
    companyId: companies[0]?.id ?? "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function updateField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    const payload = {
      workerCode: form.workerCode.trim().toUpperCase(),
      companyId: form.companyId,
      name: form.name.trim(),
      ...(form.nationality.trim() && {
        nationality: form.nationality.trim(),
      }),
      ...(form.phone.trim() && {
        phone: form.phone.trim(),
      }),
      ...(form.jobTitle.trim() && {
        jobTitle: form.jobTitle.trim(),
      }),
      ...(form.joiningDate && {
        joiningDate: form.joiningDate,
      }),
    };

    setSaving(true);

    try {
      await api.post("/workers", payload);
      onSaved();
    } catch (err) {
      const details = err.details
        ? Object.values(err.details).flat().join("; ")
        : "";

      setError(
        err instanceof ApiError
          ? `${err.message}${details ? ` — ${details}` : ""}`
          : "Could not create worker.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Add worker" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="worker-code" className="label">
              Worker ID *
            </label>
            <input
              id="worker-code"
              className="input"
              value={form.workerCode}
              onChange={(event) =>
                updateField("workerCode", event.target.value.toUpperCase())
              }
              placeholder="AB12345"
              pattern="[A-Z]{2,4}[0-9]{3,6}"
              title="Use 2–4 uppercase letters followed by 5–6 digits"
              maxLength={10}
              required
            />
          </div>

          <div>
            <label htmlFor="worker-company" className="label">
              Company *
            </label>
            <select
              id="worker-company"
              className="input"
              value={form.companyId}
              onChange={(event) =>
                updateField("companyId", event.target.value)
              }
              required
            >
              <option value="">Select a company</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.code} — {company.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="worker-name" className="label">
              Full name *
            </label>
            <input
              id="worker-name"
              className="input"
              value={form.name}
              onChange={(event) => updateField("name", event.target.value)}
              maxLength={200}
              autoComplete="name"
              required
            />
          </div>

          <div>
            <label htmlFor="worker-nationality" className="label">
              Nationality
            </label>
            <input
              id="worker-nationality"
              className="input"
              value={form.nationality}
              onChange={(event) =>
                updateField("nationality", event.target.value)
              }
            />
          </div>

          <div>
            <label htmlFor="worker-phone" className="label">
              Phone
            </label>
            <input
              id="worker-phone"
              className="input"
              type="tel"
              value={form.phone}
              onChange={(event) => updateField("phone", event.target.value)}
              autoComplete="tel"
            />
          </div>

          <div>
            <label htmlFor="worker-job-title" className="label">
              Job title
            </label>
            <input
              id="worker-job-title"
              className="input"
              value={form.jobTitle}
              onChange={(event) =>
                updateField("jobTitle", event.target.value)
              }
              placeholder="e.g. Electrician"
            />
          </div>

          <div>
            <label htmlFor="worker-joining-date" className="label">
              Joining date
            </label>
            <input
              id="worker-joining-date"
              className="input"
              type="date"
              value={form.joiningDate}
              onChange={(event) =>
                updateField("joiningDate", event.target.value)
              }
            />
          </div>
        </div>

        <p className="text-xs text-text-muted">
          Passport, visa, Emirates ID, and uploaded documents can be managed
          from the worker profile.
        </p>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={saving || companies.length === 0}
          >
            {saving ? "Saving..." : "Save worker"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function Workers() {
  const [search, setSearch] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [clientId, setClientId] = useState("");
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);

  const debouncedSearch = useDebounced(search);

  const {
    data: lookups,
    error: lookupError,
    loading: lookupsLoading,
    reload: reloadLookups,
  } = useFetch(async () => {
    const [companyData, clientData] = await Promise.all([
      api.get("/companies"),
      api.get("/clients?active=true"),
    ]);

    return {
      companies: companyData.companies ?? [],
      clients: clientData.clients ?? [],
    };
  }, []);

  const {
    data,
    error,
    loading,
    reload,
  } = useFetch(
    () =>
      api.get(
        `/workers${qs({
          search: debouncedSearch.trim() || undefined,
          companyId: companyId || undefined,
          clientId: clientId || undefined,
          page,
          pageSize: PAGE_SIZE,
        })}`,
      ),
    [debouncedSearch, companyId, clientId, page],
  );

  const workers = data?.workers ?? [];
  const companies = lookups?.companies ?? [];
  const clients = lookups?.clients ?? [];
  const pagination = data?.pagination;

  function resetPageAnd(setter) {
    return (event) => {
      setter(event.target.value);
      setPage(1);
    };
  }

  function handleWorkerSaved() {
    setAdding(false);
    setPage(1);
    reload();
  }

  const totalPages = Math.max(1, pagination?.totalPages ?? 1);
  const totalWorkers = pagination?.total ?? workers.length;

  return (
    <Card
      title="Workers"
      action={
        <button
          type="button"
          className="btn-accent"
          onClick={() => setAdding(true)}
          disabled={lookupsLoading || companies.length === 0}
          title={
            companies.length === 0
              ? "Add a company before creating a worker"
              : undefined
          }
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
          Add worker
        </button>
      }
    >
      {(lookupError || error) && (
        <div className="mb-4 space-y-2">
          {lookupError && (
            <p role="alert" className="text-sm text-danger">
              Could not load company/client filters: {lookupError}
              <button
                type="button"
                className="ml-2 underline"
                onClick={reloadLookups}
              >
                Retry
              </button>
            </p>
          )}

          {error && (
            <p role="alert" className="text-sm text-danger">
              Could not load workers: {error}
              <button
                type="button"
                className="ml-2 underline"
                onClick={reload}
              >
                Retry
              </button>
            </p>
          )}
        </div>
      )}

      <div className="mb-5 flex flex-wrap gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            type="search"
            placeholder="Search by worker ID or name"
            aria-label="Search workers"
            className="input pl-9"
            value={search}
            onChange={resetPageAnd(setSearch)}
          />
        </div>

        <select
          className="input w-auto"
          aria-label="Filter by company"
          value={companyId}
          onChange={resetPageAnd(setCompanyId)}
        >
          <option value="">All companies</option>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.code}
            </option>
          ))}
        </select>

        <select
          className="input w-auto"
          aria-label="Filter by client"
          value={clientId}
          onChange={resetPageAnd(setClientId)}
        >
          <option value="">All clients</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>
      </div>

      {loading && !data ? (
        <p className="py-6 text-center text-sm text-text-muted">
          Loading workers...
        </p>
      ) : workers.length === 0 ? (
        <EmptyState
          icon={Users}
          title={
            search || companyId || clientId
              ? "No matching workers"
              : "No workers yet"
          }
          description={
            search || companyId || clientId
              ? "Try changing your search or filters."
              : "Add your first worker to get started."
          }
        />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
                  <th className="px-3 py-3 font-medium">Worker ID</th>
                  <th className="px-3 py-3 font-medium">Name</th>
                  <th className="px-3 py-3 font-medium">Company</th>
                  <th className="px-3 py-3 font-medium">Current client</th>
                  <th className="px-3 py-3 font-medium">Job title</th>
                </tr>
              </thead>

              <tbody>
                {workers.map((worker) => (
                  <tr
                    key={worker.id}
                    className="border-b border-border last:border-0 hover:bg-paper"
                  >
                    <td className="px-3 py-3 font-medium">
                      <Link
                        to={`/workers/${worker.id}`}
                        className="text-accent-dark hover:underline"
                      >
                        {worker.workerCode}
                      </Link>
                    </td>

                    <td className="px-3 py-3 text-text">
                      {worker.name}
                    </td>

                    <td className="px-3 py-3 text-text-muted">
                      {worker.company?.code || worker.company?.name || "—"}
                    </td>

                    <td className="px-3 py-3 text-text-muted">
                      {worker.currentClient?.name || "Unassigned"}
                    </td>

                    <td className="px-3 py-3 text-text-muted">
                      {worker.jobTitle || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-text-muted">
              <span>
                {totalWorkers} worker{totalWorkers === 1 ? "" : "s"}
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((current) => current - 1)}
                >
                  Previous
                </button>

                <span>
                  Page {page} of {totalPages}
                </span>

                <button
                  type="button"
                  className="btn-secondary"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {adding && (
        <AddWorkerModal
          companies={companies}
          onClose={() => setAdding(false)}
          onSaved={handleWorkerSaved}
        />
      )}
    </Card>
  );
}