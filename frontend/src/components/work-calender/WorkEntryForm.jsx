
import { Download } from "lucide-react";

import Badge from "../ui/Badge.jsx";
import { formatRole } from "./workCalendarUtils.js";

export default function WorkEntryForm({
  workerId,
  selectedTitle,
  selectedRecord,
  roles,
  selectedRoleId,
  setSelectedRoleId,
  editRoleId,
  setEditRoleId,
  roleSelectRef,
  entryValue,
  saving,
  pendingEdit,
  saveError,
  onSubmit,
  onNavigateDate,
}) {
  const isEditingManual = selectedRecord?.source === "MANUAL";

  return (
    <section className="space-y-3 rounded-md border border-border bg-paper p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-text">{selectedTitle}</p>

          <p className="mt-1 text-xs text-text-muted">
            Enter hours or A, H, or W directly in the selected calendar
            cell. Use the arrow keys or buttons to move between days.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => onNavigateDate(-1)}
            aria-label="Previous day"
            title="Previous day (←)"
          >
            <span aria-hidden="true">←</span>
          </button>

          <button
            type="button"
            className="btn-secondary"
            onClick={() => onNavigateDate(1)}
            aria-label="Next day"
            title="Next day (→)"
          >
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>

      {selectedRecord && (
        <div className="space-y-2 text-sm">
          <p className="text-text-muted">
            {isEditingManual
              ? "Manual work record"
              : "Timesheet record — read-only"}
          </p>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="flex items-center gap-1">
              Status: <Badge status={selectedRecord.status} />
            </span>

            <span>
              Hours:{" "}
              {selectedRecord.status === "WORKED"
                ? selectedRecord.hours ?? "—"
                : "—"}
            </span>

            <span>
              Role:{" "}
              {selectedRecord.status === "WORKED"
                ? formatRole(selectedRecord.role)
                : "—"}
            </span>
          </div>

          {selectedRecord.upload && (
            <a
              className="inline-flex items-center gap-1 text-accent-dark hover:underline"
              href={`/api/timesheets/${selectedRecord.upload.id}/source`}
            >
              <Download className="h-3.5 w-3.5" />
              View source timesheet (
              {selectedRecord.upload.originalFilename})
            </a>
          )}
        </div>
      )}

      {(!selectedRecord || isEditingManual) && (
        <form
          onSubmit={onSubmit}
          className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"
        >
          <div>
            <label
              htmlFor={`work-role-${workerId}`}
              className="mb-1 block text-xs font-medium text-text-muted"
            >
              Role
            </label>

            <select
              ref={roleSelectRef}
              id={`work-role-${workerId}`}
              className="input w-full"
              value={selectedRecord ? editRoleId : selectedRoleId}
              onChange={(event) => {
                if (selectedRecord) {
                  setEditRoleId(event.target.value);
                } else {
                  setSelectedRoleId(event.target.value);
                }
              }}
              disabled={saving || Boolean(pendingEdit)}
            >
              <option value="">
                {selectedRecord ? "No role selected" : "Select role"}
              </option>

              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.code} — {role.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              className="btn-primary w-full"
              disabled={
                !entryValue.trim() ||
                saving ||
                Boolean(pendingEdit) ||
                (!selectedRecord && !selectedRoleId)
              }
            >
              {saving
                ? "Saving..."
                : selectedRecord
                  ? "Review change"
                  : "Save"}
            </button>
          </div>
        </form>
      )}

      {saveError && (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger"
        >
          {typeof saveError === "string"
            ? saveError
            : saveError.message || "Unable to save the work record."}
        </div>
      )}
    </section>
  );
}
