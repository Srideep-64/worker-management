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

  const [isActive, setIsActive] = useState(worker.isActive ?? true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");

    // Blank fields are omitted; isActive is always included.
    const body = { isActive };

    Object.entries(form).forEach(([key, value]) => {
      if (value) body[key] = value;
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
          : "Could not save"
      );
      setSaving(false);
    }
  }

  return (
    <Modal title={`Edit ${worker.workerCode}`} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="worker-status" className="label">
            Worker status
          </label>

          <select
            id="worker-status"
            className="input"
            value={isActive ? "ACTIVE" : "INACTIVE"}
            onChange={(e) => setIsActive(e.target.value === "ACTIVE")}
          >
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>

          <p className="mt-1 text-xs text-text-muted">
            Inactive workers cannot receive new attendance records.
            Existing attendance and payroll history will be preserved.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {FIELDS.map(([key, label, type]) => (
            <div key={key}>
              <label htmlFor={`worker-${key}`} className="label">
                {label}
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
              />
            </div>
          ))}
        </div>

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

          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}