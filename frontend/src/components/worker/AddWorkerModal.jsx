import { useState } from "react";

import Modal from "../ui/Modal.jsx";
import { api, ApiError } from "../../api/client.js";

const INITIAL_FORM = {
  workerCode: "",
  companyId: "",
  name: "",
  nationality: "",
  phone: "",
  jobTitle: "",
  joiningDate: "",
};

export default function AddWorkerModal({ companies, onClose, onSaved }) {
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
      joiningDate: form.joiningDate,
      ...(form.nationality.trim() && {
        nationality: form.nationality.trim(),
      }),
      ...(form.phone.trim() && {
        phone: form.phone.trim(),
      }),
      ...(form.jobTitle.trim() && {
        jobTitle: form.jobTitle.trim(),
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
              title="Use 2–4 uppercase letters followed by 3–6 digits"
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
              Joining date *
            </label>
            <input
              id="worker-joining-date"
              className="input"
              type="date"
              value={form.joiningDate}
              onChange={(event) =>
                updateField("joiningDate", event.target.value)
              }
              required
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
