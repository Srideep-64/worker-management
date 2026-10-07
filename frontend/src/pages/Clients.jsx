
import { useState } from "react";
import {
  Briefcase,
  Plus,
  Search,
  RefreshCw,
} from "lucide-react";

import Card from "../components/ui/Card.jsx";
import Badge from "../components/ui/Badge.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";
import Modal from "../components/ui/Modal.jsx";

import { api, qs, ApiError } from "../api/client.js";
import { useFetch, useDebounced } from "../hooks.js";

const BLANK = {
  code: "",
  name: "",
  phone: "",
  email: "",
  address: "",
  active: true,
};

// Add/Edit Client Modal
function ClientModal({ client, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({
    ...BLANK,
    ...(client || {}),
  }));

  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Reusable controlled input handler
  const set = (key) => (event) => {
    const value = event.target.value;

    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  async function submit(event) {
    event.preventDefault();

    setSaving(true);
    setError("");

    // Trim required fields and omit empty optional fields
    const body = {
      code: form.code.trim(),
      name: form.name.trim(),
      active: form.active,
    };

    ["phone", "email", "address"].forEach((key) => {
      const value = form[key]?.trim();

      if (value) {
        body[key] = value;
      }
    });

    try {
      if (client) {
        await api.put(`/clients/${client.id}`, body);
      } else {
        await api.post("/clients", body);
      }

      onSaved();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err.message || "Could not save client."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={client ? "Edit client" : "Add client"}
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4">

        {/* Code and Name */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="client-code">
              Client code *
            </label>

            <input
              id="client-code"
              className="input"
              value={form.code}
              onChange={set("code")}
              placeholder="e.g. CLI001"
              maxLength={20}
              required
            />
          </div>

          <div>
            <label className="label" htmlFor="client-name">
              Client name *
            </label>

            <input
              id="client-name"
              className="input"
              value={form.name}
              onChange={set("name")}
              placeholder="Company or client name"
              maxLength={200}
              required
            />
          </div>

          {/* Phone and Email */}
          <div>
            <label className="label" htmlFor="client-phone">
              Phone
            </label>

            <input
              id="client-phone"
              className="input"
              value={form.phone || ""}
              onChange={set("phone")}
              placeholder="Phone number"
              maxLength={30}
            />
          </div>

          <div>
            <label className="label" htmlFor="client-email">
              Email
            </label>

            <input
              id="client-email"
              type="email"
              className="input"
              value={form.email || ""}
              onChange={set("email")}
              placeholder="contact@example.com"
            />
          </div>
        </div>

        {/* Address */}
        <div>
          <label className="label" htmlFor="client-address">
            Address
          </label>

          <textarea
            id="client-address"
            className="input min-h-20"
            value={form.address || ""}
            onChange={set("address")}
            placeholder="Client address"
            maxLength={300}
          />
        </div>

        {/* Active Status */}
        <label className="flex items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                active: event.target.checked,
              }))
            }
          />

          Active
        </label>

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
            {saving ? "Saving..." : "Save client"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Main Clients Page
export default function Clients() {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);

  const debounced = useDebounced(search);

  const {
    data,
    error,
    loading,
    reload,
  } = useFetch(
    () => api.get(`/clients${qs({ search: debounced })}`),
    [debounced]
  );

  const clients = data?.clients || [];

  function handleSaved() {
    setEditing(null);
    reload();
  }

  return (
    <Card
      title="Clients"
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

          {/* Add Client */}
          <button
            type="button"
            className="btn-accent"
            onClick={() => setEditing("new")}
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            Add client
          </button>
        </div>
      }
    >
      {/* Search */}
      <div className="relative mb-5 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />

        <input
          type="text"
          placeholder="Search clients"
          className="input pl-9"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {/* Error */}
      {error && (
        <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error.message || error}
        </p>
      )}

      {/* Loading */}
      {loading ? (
        <div className="py-10 text-center text-sm text-text-muted">
          Loading clients...
        </div>
      ) : clients.length === 0 ? (
        /* Empty State */
        <EmptyState
          icon={Briefcase}
          title={search ? "No matching clients" : "No clients found"}
          description={
            search
              ? "Try a different search term."
              : "Add a client company to assign workers to it."
          }
        />
      ) : (
        /* Clients Table */
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
                <th className="px-3 py-3 font-medium">Code</th>
                <th className="px-3 py-3 font-medium">Name</th>
                <th className="px-3 py-3 font-medium">Phone</th>
                <th className="px-3 py-3 font-medium">Email</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 text-right font-medium">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-border">
              {clients.map((client) => (
                <tr key={client.id}>
                  <td className="px-3 py-3 font-medium text-text">
                    {client.code}
                  </td>

                  <td className="px-3 py-3 text-text">
                    {client.name}
                  </td>

                  <td className="px-3 py-3 text-text-muted">
                    {client.phone || "—"}
                  </td>

                  <td className="px-3 py-3 text-text-muted">
                    {client.email || "—"}
                  </td>

                  <td className="px-3 py-3">
                    <Badge
                      tone={client.active ? "success" : "neutral"}
                    >
                      {client.active ? "Active" : "Inactive"}
                    </Badge>
                  </td>

                  <td className="px-3 py-3 text-right">
                    <button
                      type="button"
                      className="text-sm text-accent-dark hover:underline"
                      onClick={() => setEditing(client)}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Modal */}
      {editing && (
        <ClientModal
          key={editing === "new" ? "new" : editing.id}
          client={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
    </Card>
  );
}