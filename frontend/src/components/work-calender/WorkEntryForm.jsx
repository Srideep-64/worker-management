
import { Download } from "lucide-react";

import Badge from "../ui/Badge.jsx";
import { formatRole } from "./workCalendarUtils.js";

export default function WorkEntryForm({
  workerId,
  selectedTitle,
  selectedRecord,
  selectedDraft,
  roles,
  selectedRoleId,
  setSelectedRoleId,
  editRoleId,
  setEditRoleId,
  roleSelectRef,
  entryValue,
  saving,
  saveError,
  onSubmit,
  onNavigateDate,
}) {
  const isEditingManual = selectedRecord?.source === "MANUAL";
  const hasSavedRecord = Boolean(selectedRecord);

  const draftRole =
    roles.find((role) => role.id === selectedDraft?.roleId) ??
    selectedRecord?.role;

  const shownRecord = selectedDraft
    ? {
        ...selectedRecord,
        ...selectedDraft,
        source: "MANUAL",
        role: draftRole,
        upload: selectedRecord?.upload,
      }
    : selectedRecord;

  const roleValue = selectedDraft?.roleId
    ? selectedDraft.roleId
    : hasSavedRecord
      ? editRoleId
      : selectedRoleId;

  const hasRole = hasSavedRecord
    ? Boolean(
        editRoleId ||
          selectedDraft?.roleId ||
          selectedRecord?.roleId ||
          selectedRecord?.role?.id ||
          selectedRoleId,
      )
    : Boolean(selectedRoleId || selectedDraft?.roleId);

  const canEdit = !hasSavedRecord || isEditingManual;

  return (
    <section className="space-y-3 rounded-md border border-border bg-paper p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-text">{selectedTitle}</p>

          <p className="mt-1 text-xs text-text-muted">
            New records and edits stay pending until you confirm Upload
            records.
          </p>
        </div>
      </div>

      {shownRecord && (
        <div className="space-y-2 text-sm">
          <p className="text-text-muted">
            {selectedDraft
              ? hasSavedRecord
                ? "Manual record — pending changes"
                : "New attendance record — pending upload"
              : isEditingManual
                ? "Manual work record"
                : "Timesheet record — read-only"}
          </p>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="flex items-center gap-1">
              Status: <Badge status={shownRecord.status} />
            </span>

            <span>
              Hours:{" "}
              {shownRecord.status === "WORKED"
                ? shownRecord.hours ?? "—"
                : "—"}
            </span>

            <span>
              Role:{" "}
              {shownRecord.status === "WORKED"
                ? formatRole(shownRecord.role)
                : "—"}
            </span>
          </div>

          {shownRecord.upload && (
            <a
              className="inline-flex items-center gap-1 text-accent-dark hover:underline"
              href={`/api/timesheets/${shownRecord.upload.id}/source`}
            >
              <Download className="h-3.5 w-3.5" />
              View source timesheet (
              {shownRecord.upload.originalFilename})
            </a>
          )}
        </div>
      )}

      {canEdit && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(event);
          }}
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
              value={roleValue}
              onChange={(event) => {
                if (hasSavedRecord) {
                  setEditRoleId(event.target.value);
                } else {
                  setSelectedRoleId(event.target.value);
                }
              }}
              disabled={saving}
            >
              <option value="">
                {hasSavedRecord ? "No role selected" : "Select role"}
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
                !hasRole
              }
              
            >
              {saving
                ? "Uploading…"
                : selectedDraft
                  ? "Update pending record"
                  : hasSavedRecord
                    ? "Stage update"
                    : "Add to pending records"}
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
            : saveError.message || "Unable to stage the work record."}
        </div>
      )}
    </section>
  );
}
