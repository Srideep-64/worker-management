
import { useState } from "react";

import Modal from "../ui/Modal.jsx";
import { api, ApiError } from "../../api/client.js";

export default function AddCompanyModal({ onClose, onCreated }) {
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

    try {
      await api.post("/companies", {
        code: form.code.trim(),
        name: form.name.trim(),
      });

      await onCreated();
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

        {error && (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
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
            {saving ? "Saving..." : "Save company"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
