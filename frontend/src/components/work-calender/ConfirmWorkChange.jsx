
import { formatDate } from "./workCalendarUtils.js";

function ChangeRow({ label, oldValue, newValue }) {
  return (
    <div className="grid gap-3 border-t border-border py-3 sm:grid-cols-2">
      <div className="min-w-0">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-text-muted">
          Previous {label}
        </p>

        <p className="break-words text-xl font-bold text-red-600 sm:text-2xl">
          {oldValue}
        </p>
      </div>

      <div className="min-w-0">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-text-muted">
          New {label}
        </p>

        <p className="break-words text-xl font-bold text-green-600 sm:text-2xl">
          {newValue}
        </p>
      </div>
    </div>
  );
}

export default function ConfirmWorkChange({
  pendingEdit,
  saving,
  onConfirm,
  onCancel,
}) {
  if (!pendingEdit) return null;

  return (
    <div
      className="space-y-4 rounded-lg border-2 border-border bg-white p-4 sm:p-5"
      role="region"
      aria-label="Confirm manual record change"
    >
      <div>
        <h3 className="text-lg font-bold text-text sm:text-xl">
          Confirm record change
        </h3>

        <p className="mt-1 text-sm text-text-muted">
          You are changing the manual record of{" "}
          <span className="font-semibold text-text">
            {formatDate(pendingEdit.date)}
          </span>
          .
        </p>
      </div>

      <div>
        {pendingEdit.changes.map((change) => (
          <ChangeRow key={change.key} {...change} />
        ))}
      </div>

      <p className="text-sm text-text-muted">
        The record will not change unless you confirm.
      </p>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          className="btn-secondary"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </button>

        <button
          type="button"
          className="btn-primary"
          onClick={onConfirm}
          disabled={saving}
        >
          {saving ? "Updating..." : "Confirm change"}
        </button>
      </div>
    </div>
  );
}
