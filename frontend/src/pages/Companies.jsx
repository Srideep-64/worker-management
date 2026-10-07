
import { useState } from "react";
import { Link } from "react-router-dom";
import { Building2, Plus, RefreshCw } from "lucide-react";

import Card from "../components/ui/Card.jsx";
import Badge from "../components/ui/Badge.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";
import Modal from "../components/ui/Modal.jsx";

import { api, ApiError } from "../api/client.js";
import { useFetch } from "../hooks.js";

// Add Company Modal
function AddCompanyModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    code: "",
    name: "",
  });

  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function updateField(event) {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function submit(event) {
    event.preventDefault();

    setSaving(true);
    setError("");

    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
    };

    try {
      await api.post("/companies", payload);
      onCreated();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err.message || "Failed to create company."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Add company" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">

        {/* Company Code */}
        <div>
          <label className="label" htmlFor="company-code">
            Company code *
          </label>

          <input
            id="company-code"
            name="code"
            className="input"
            value={form.code}
            onChange={updateField}
            placeholder="e.g. ABC"
            maxLength={10}
            required
          />
        </div>

        {/* Company Name */}
        <div>
          <label className="label" htmlFor="company-name">
            Company name *
          </label>

          <input
            id="company-name"
            name="name"
            className="input"
            value={form.name}
            onChange={updateField}
            placeholder="Enter company name"
            maxLength={200}
            required
          />
        </div>

        {/* Error */}
        {error && (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {/* Actions */}
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
            disabled={saving}
          >
            {saving ? "Saving..." : "Save company"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Main Companies Page
export default function Companies() {
  const [adding, setAdding] = useState(false);

  const {
    data,
    error,
    loading,
    reload,
  } = useFetch(
    () => api.get("/companies"),
    []
  );

  const companies = data?.companies || [];

  function handleCreated() {
    setAdding(false);
    reload();
  }

  return (
    <Card
      title="Companies"
      action={
        <div className="flex gap-2">

          {/* Refresh */}
          <button
            type="button"
            className="btn-secondary"
            onClick={reload}
            disabled={loading}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>

          {/* Add Company */}
          <button
            type="button"
            className="btn-accent"
            onClick={() => setAdding(true)}
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            Add company
          </button>
        </div>
      }
    >

      {/* Error */}
      {error && (
        <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error.message || error}
        </p>
      )}

      {/* Loading */}
      {loading ? (
        <div className="py-10 text-center text-sm text-text-muted">
          Loading companies...
        </div>
      ) : companies.length === 0 ? (

        /* Empty State */
        <EmptyState
          icon={Building2}
          title="No companies yet"
          description="Add your first company to start assigning workers to it."
        />

      ) : (

        /* Company Cards */
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {companies.map((company) => {
            const workerCount =
              company.workerCount ?? company._count?.workers;

            return (
              <Link
                key={company.id}
                to={`/companies/${company.id}`}
                className="group rounded-xl border border-border p-4 transition-colors hover:border-accent hover:bg-accent-soft/30"
              >
                <div className="flex items-start justify-between gap-3">

                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-accent-dark">
                      {company.code}
                    </p>

                    <p className="mt-1 font-semibold text-text">
                      {company.name}
                    </p>
                  </div>

                  <Building2 className="h-5 w-5 shrink-0 text-text-muted transition-colors group-hover:text-accent" />
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <p className="text-sm text-text-muted">
                    {workerCount ?? "—"} workers
                  </p>

                  <Badge tone="neutral">
                    View details
                  </Badge>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Add Company Modal */}
      {adding && (
        <AddCompanyModal
          onClose={() => setAdding(false)}
          onCreated={handleCreated}
        />
      )}
    </Card>
  );
}