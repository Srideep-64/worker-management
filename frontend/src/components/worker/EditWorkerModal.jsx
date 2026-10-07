import { useState } from "react";
import Modal from "../ui/Modal.jsx";
import { api, ApiError } from "../../api/client.js";

const d = (v) => (v ? String(v).slice(0, 10) : "");
const FIELDS = [
  ["name", "Name", "text"], ["nationality", "Nationality", "text"], ["dateOfBirth", "Date of birth", "date"],
  ["phone", "Phone", "text"], ["jobTitle", "Job title", "text"], ["joiningDate", "Joining date", "date"],
  ["passportNumber", "Passport number", "text"], ["passportExpiry", "Passport expiry", "date"],
  ["visaNumber", "Visa number", "text"], ["visaExpiry", "Visa expiry", "date"],
  ["emiratesIdNumber", "Emirates ID number", "text"], ["emiratesIdExpiry", "Emirates ID expiry", "date"],
  ["labourCardNumber", "Labour card number", "text"],
];

export default function EditWorkerModal({ worker, onClose, onSaved }) {
  const [form, setForm] = useState(() => Object.fromEntries(FIELDS.map(([k, , t]) => [k, t === "date" ? d(worker[k]) : worker[k] || ""])));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    // Blank fields are left unchanged (the API treats omitted fields as "no change").
    const body = {};
    Object.entries(form).forEach(([k, v]) => v && (body[k] = v));
    try {
      await api.put(`/workers/${worker.id}`, body);
      onSaved();
    } catch (err) {
      const det = err.details ? " — " + Object.values(err.details).flat().join("; ") : "";
      setError(err instanceof ApiError ? err.message + det : "Could not save");
      setSaving(false);
    }
  }

  return (
    <Modal title={`Edit ${worker.workerCode}`} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {FIELDS.map(([k, label, type]) => (
            <div key={k}>
              <label className="label">{label}</label>
              <input className="input" type={type} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
            </div>
          ))}
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving}>Save</button>
        </div>
      </form>
    </Modal>
  );
}
