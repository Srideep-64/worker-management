
import { useState } from "react";
import { AlertTriangle, CalendarDays, Info } from "lucide-react";

import Modal from "../ui/Modal.jsx";
import { api, ApiError } from "../../api/client.js";

const toDateInput = (value) =>
  value ? String(value).slice(0, 10) : "";

export default function ChangeWorkerStatusModal({
  worker,
  onClose,
  onSaved,
}) {
  const [leavingDate, setLeavingDate] = useState(
    toDateInput(worker.leavingDate)
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");

    if (!leavingDate) {
      setError("Select a leaving date, or use Clear leaving date if the worker is staying.");
      return;
    }

    if (
      worker.joiningDate &&
      leavingDate < toDateInput(worker.joiningDate)
    ) {
      setError("Leaving date cannot be earlier than the joining date.");
      return;
    }

    setSaving(true);

    try {
      await api.put(`/workers/${worker.id}`, {
        leavingDate,
      });

      onSaved();
    } catch (err) {
      const details = err.details
        ? " — " + Object.values(err.details).flat().join("; ")
        : "";

      setError(
        err instanceof ApiError
          ? err.message + details
          : "Could not update the leaving date."
      );
    } finally {
      setSaving(false);
    }
  }

  async function clearLeavingDate() {
    setError("");
    setSaving(true);

    try {
      await api.put(`/workers/${worker.id}`, {
        leavingDate: null,
      });

      onSaved();
    } catch (err) {
      const details = err.details
        ? " — " + Object.values(err.details).flat().join("; ")
        : "";

      setError(
        err instanceof ApiError
          ? err.message + details
          : "Could not clear the leaving date."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Change worker status"
      onClose={onClose}
      wide
    >
      <form onSubmit={submit} className="space-y-5">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />

            <div>
              <h3 className="font-semibold text-red-700">
                Worker leaving?
              </h3>

              <p className="mt-1 text-sm text-red-700">
                Record the worker's final working date below.
                Their status will be calculated automatically
                from their joining and leaving dates.
              </p>
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="worker-leaving-date" className="label">
            Leaving date *
          </label>

          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />

            <input
              id="worker-leaving-date"
              className="input pl-9"
              type="date"
              value={leavingDate}
              min={toDateInput(worker.joiningDate) || undefined}
              onChange={(e) => setLeavingDate(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="rounded-lg border border-border bg-paper p-4">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-text-muted" />

            <div className="space-y-2 text-sm text-text-muted">
              <p className="font-medium text-text">
                When will the worker become inactive?
              </p>

              <p>
                The worker remains active throughout the month
                containing their leaving date. They become
                inactive from the first day of the following month.
              </p>

              <p>
                <strong>Example:</strong> If the leaving date is
                any day from 1 August to 31 August, the worker
                remains active for August and becomes inactive
                from 1 September.
              </p>

              <p>
                Their existing attendance and payroll history
                will be preserved.
              </p>
            </div>
          </div>
        </div>

        {worker.leavingDate && (
          <button
            type="button"
            className="text-sm font-medium text-red-700 underline hover:text-red-800"
            onClick={clearLeavingDate}
            disabled={saving}
          >
            Clear leaving date — worker is staying
          </button>
        )}

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
            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={saving || !leavingDate}
          >
            {saving ? "Saving..." : "Save leaving date"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
