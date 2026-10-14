
import { useState } from "react";
import Modal from "../ui/Modal.jsx";
import { api, ApiError } from "../../api/client.js";

const d = (v) => (v ? String(v).slice(0, 10) : "");

const FIELDS = [
  ["name", "Name", "text"],
  ["nationality", "Nationality", "text"],
  ["dateOfBirth", "Date of birth", "date"],
  ["phone", "Phone", "text"],
  ["jobTitle", "Job title", "text"],
  ["joiningDate", "Joining date", "date"],
  ["passportNumber", "Passport number", "text"],
  ["passportExpiry", "Passport expiry", "date"],
  ["visaNumber", "Visa number", "text"],
  ["visaExpiry", "Visa expiry", "date"],
  ["emiratesIdNumber", "Emirates ID number", "text"],
  ["emiratesIdExpiry", "Emirates ID expiry", "date"],
  ["labourCardNumber", "Labour card number", "text"],
];

export default function EditWorkerModal({ worker, onClose, onSaved }) {
  const [form, setForm] = useState(() =>
    Object.fromEntries(
      FIELDS.map(([key, , type]) => [
        key,
        type === "date" ? d(worker[key]) : worker[key] || "",
      ])
    )
  );

  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const body = {};

    Object.entries(form).forEach(([key, value]) => {
      if (value) {
        body[key] = value;
      }
    });

    try {
      await api.put(`/workers/${worker.id}`, body);
      onSaved();
    } catch (err) {
      const details = err.details
        ? " — " + Object.values(err.details).flat().join("; ")
        : "";

      setError(
        err instanceof ApiError
          ? err.message + details
          : "Could not save worker details."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Edit ${worker.workerCode}`} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {FIELDS.map(([key, label, type]) => (
            <div key={key}>
              <label htmlFor={`worker-${key}`} className="label">
                {label}
                {key === "joiningDate" ? " *" : ""}
              </label>

              <input
                id={`worker-${key}`}
                className="input"
                type={type}
                value={form[key]}
                onChange={(e) =>
                  setForm((previous) => ({
                    ...previous,
                    [key]: e.target.value,
                  }))
                }
                required={key === "joiningDate"}
              />
            </div>
          ))}
        </div>

        <p className="text-xs text-text-muted">
          Worker status is determined automatically from the joining
          and leaving dates. Use Change Status on the worker profile
          to record a leaving date.
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
            disabled={saving}
          >
            {saving ? "Saving..." : "Save details"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
