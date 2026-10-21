import { useState } from "react";
import { TriangleAlert } from "lucide-react";

import Modal from "../ui/Modal.jsx";
import { api, invalidate } from "../../api/client.js";

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

function getValidationErrors(error) {
  const errors =
    error?.details?.errors ?? error?.details ?? error?.payload?.errors;
  return Array.isArray(errors) ? errors : [];
}

function uaeMonth(offset = 0) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const v = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const d = new Date(Number(v.year), Number(v.month) - 1 + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function describeSnapshot(snapshot) {
  if (!snapshot) return "—";
  return (
    [snapshot.role, snapshot.hours != null ? `${snapshot.hours} h` : null, snapshot.status]
      .filter(Boolean)
      .join(" · ") || "—"
  );
}

export default function UploadModal({ companies, onClose, onDone }) {
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const [periodMonth, setPeriodMonth] = useState(() => uaeMonth(-1));
  const [file, setFile] = useState(null);

  const [step, setStep] = useState("form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [validationErrors, setValidationErrors] = useState([]);
  const [result, setResult] = useState(null);

  // The only decision left to the user: replace the active timesheet.
  // Nothing is ever deleted by an upload.
  const [supersedeTimesheet, setSupersedeTimesheet] = useState(false);

  const manualConflicts = result?.manualConflicts ?? [];
  const manualConflictCount = result?.manualConflictCount ?? manualConflicts.length;
  const hasManualConflicts = manualConflictCount > 0;
  const hasTimesheetConflict = Boolean(result?.conflict);
  const noUsefulChanges = hasTimesheetConflict && result?.hasUsefulChanges === false;
  const summary = result?.summary;
  const visibleChanges = (result?.timesheetChanges ?? []).filter((c) => c.type !== "REMOVED");
  const changesTotal = result?.timesheetChangesTotal ?? visibleChanges.length;
  const manualWorkerCount = new Set(manualConflicts.map((c) => c.workerCode)).size;
  const removedRecords = result?.removedRecords ?? [];
  const removedCount = result?.removedCount ?? removedRecords.length;
  const blocked = hasManualConflicts || removedCount > 0;
  const activeSourceUrl = result?.conflict
    ? `/api/timesheets/${result.conflict.existingUploadId}/source`
    : null;
  // Lists in the preview are capped by the server; the CSV has everything.
  const reviewCsvUrl = result?.upload?.id
    ? `/api/timesheets/${result.upload.id}/diff.csv`
    : null;

  const summaryParts = [];
  if (summary) {
    summaryParts.push(
      hasTimesheetConflict
        ? `${summary.totalRows} rows in file`
        : `${summary.rowsToCreate} new row${summary.rowsToCreate === 1 ? "" : "s"} will be created`,
    );
    if (summary.manualToRelabel > 0) {
      summaryParts.push(
        `${summary.manualToRelabel} manual record${summary.manualToRelabel === 1 ? "" : "s"} re-labelled as timesheet`,
      );
    }
  }

  // Only one ACTIVE timesheet per company and month, so replacing it is
  // required. Blockers (manual overlaps, dropped records) must be fixed in
  // the file first.
  const canImport =
    !busy &&
    !noUsefulChanges &&
    !blocked &&
    (!hasTimesheetConflict || supersedeTimesheet);

  // Dismissing the preview cancels the pending upload so it doesn't linger as
  // PROCESSING. Best effort: the server also expires stale ones.
  async function handleClose() {
    const uploadId = result?.upload?.id;
    if (!busy && step === "preview" && uploadId && result?.upload?.status === "PROCESSING") {
      try {
        await api.post(`/timesheets/${uploadId}/cancel`, {});
        invalidate("/timesheets");
      } catch {
        /* ignore */
      }
    }
    onClose();
  }

  function resetForm() {
    setStep("form");
    setFile(null);
    setResult(null);
    setSupersedeTimesheet(false);
    setError("");
    setValidationErrors([]);
  }

  async function handleUpload(event) {
    event.preventDefault();
    if (!companyId || !periodMonth || !file) {
      setError("Select a company, month, and Excel file.");
      return;
    }

    setBusy(true);
    setError("");
    setValidationErrors([]);

    const formData = new FormData();
    formData.append("companyId", companyId);
    formData.append("periodMonth", periodMonth);
    formData.append("file", file);

    try {
      const response = await api.post("/timesheets/upload", formData);
      invalidate("/timesheets", "/companies", "/workers", "/dashboard");
      setResult(response);
      setSupersedeTimesheet(false);
      setStep("preview");
    } catch (err) {
      const errors = getValidationErrors(err);
      if (errors.length > 0 || err?.status === 422) {
        setValidationErrors(errors);
        setStep("errors");
      } else {
        setError(err.message || "Failed to upload timesheet.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm() {
    const uploadId = result?.upload?.id;
    if (!uploadId) {
      setError("Upload information is missing. Please upload the file again.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const response = await api.post(`/timesheets/${uploadId}/confirm`, {
        replace: supersedeTimesheet,
      });
      onDone(response);
    } catch (err) {
      const errors = getValidationErrors(err);
      if (errors.length > 0 || err?.status === 422) {
        setValidationErrors(errors);
        setStep("errors");
      } else if (
        err?.status === 409 &&
        (err?.details?.manualConflicts?.length || err?.details?.removedRecords?.length)
      ) {
        // Data changed since the preview: show the new blockers.
        setResult((current) => ({
          ...current,
          manualConflicts: err.details.manualConflicts ?? current.manualConflicts,
          manualConflictCount:
            err.details.manualConflictCount ?? current.manualConflictCount,
          removedRecords: err.details.removedRecords ?? current.removedRecords,
          removedCount: err.details.removedCount ?? current.removedCount,
        }));
        setError(err.message || "Blocking conflicts were found.");
      } else if (err?.status === 409) {
        setError(
          err.message ||
            "The data changed since the preview. Please upload the file again.",
        );
      } else {
        setError(err.message || "Failed to confirm timesheet.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Upload timesheet" onClose={handleClose} wide={step !== "form"}>
      {step === "form" && (
        <form onSubmit={handleUpload} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="timesheet-company">Company</label>
              <select
                id="timesheet-company"
                className="input"
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                required
              >
                <option value="">Select company</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.code} — {company.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label" htmlFor="timesheet-month">Month</label>
              <input
                id="timesheet-month"
                type="month"
                className="input"
                value={periodMonth}
                max={uaeMonth(0)}
                onChange={(e) => setPeriodMonth(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="timesheet-file">
              Excel file (.xlsx / .xls)
            </label>
            <input
              id="timesheet-file"
              type="file"
              className="input"
              accept=".xlsx,.xls"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              required
            />
          </div>

          <p className="text-xs text-text-muted">
            The workbook is validated before work records are imported.
          </p>

          {error && <p role="alert" className="text-sm text-danger">{error}</p>}

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={busy || !companyId || !periodMonth || !file}
            >
              {busy ? "Validating…" : "Upload & validate"}
            </button>
          </div>
        </form>
      )}

      {step === "errors" && (
        <div className="space-y-4">
          <div className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
            {validationErrors.length} validation issue
            {validationErrors.length === 1 ? "" : "s"} found. Fix the workbook
            and upload it again.
          </div>

          {validationErrors.length > 0 ? (
            <div className="max-h-80 overflow-auto rounded-md border border-border">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-paper text-xs uppercase tracking-wide text-text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">Sheet</th>
                    <th className="px-3 py-2 font-medium">Row</th>
                    <th className="px-3 py-2 font-medium">Field</th>
                    <th className="px-3 py-2 font-medium">Problem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {validationErrors.map((item, index) => (
                    <tr key={`${item.sheet ?? ""}-${item.row ?? ""}-${item.field ?? ""}-${index}`}>
                      <td className="px-3 py-2 text-text-muted">{item.sheet || "—"}</td>
                      <td className="px-3 py-2 tabular-nums text-text-muted">{item.row ?? "—"}</td>
                      <td className="px-3 py-2 text-text-muted">{item.field || "—"}</td>
                      <td className="px-3 py-2 text-text">{item.message || "Unknown validation issue"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-text-muted">
              The server rejected the upload, but did not return individual
              validation details.
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={resetForm} disabled={busy}>
              Try another file
            </button>
            <button type="button" className="btn-primary" onClick={onClose} disabled={busy}>
              Close
            </button>
          </div>
        </div>
      )}

      {step === "preview" && (
        <div className="space-y-4">
          <div className="rounded-md border border-border bg-paper px-3 py-3 text-sm">
            <p className="font-medium text-text">File validated successfully.</p>
            <p className="mt-1 text-text-muted">
              Format: {result?.format || "—"} · Records: {result?.rowCount ?? 0}
            </p>
            {summaryParts.length > 0 && (
              <p className="mt-1 text-text">{summaryParts.join(" · ")}</p>
            )}
          </div>

          {/* ---------- Previous active timesheet ---------- */}
          {hasTimesheetConflict && noUsefulChanges && (
            <div role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-3 py-3 text-sm text-danger">
              <p className="font-semibold">The timesheet does not update any data.</p>
              <p className="mt-1">
                The uploaded records are identical to the active timesheet.
                Nothing would be replaced.
              </p>
            </div>
          )}

          {hasTimesheetConflict && !noUsefulChanges && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
              <div className="flex gap-2">
                <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                <div className="space-y-1">
                  <p className="font-semibold">
                    An active timesheet already exists for this company and month.
                  </p>
                  <p>
                    {summary?.added ?? 0} added ({summary?.workersAdded ?? 0} worker
                    {summary?.workersAdded === 1 ? "" : "s"}) ·{" "}
                    {summary?.changed ?? 0} changed ({summary?.workersChanged ?? 0}) ·{" "}
                    {summary?.removed ?? 0} missing ({summary?.workersRemoved ?? 0})
                  </p>
                </div>
              </div>

              {visibleChanges.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-medium">
                    View changes ({changesTotal})
                  </summary>
                  {changesTotal > visibleChanges.length && reviewCsvUrl && (
                    <p className="mt-2 text-xs">
                      Showing the first {visibleChanges.length} of {changesTotal}.{" "}
                      <a className="underline" href={reviewCsvUrl} download>
                        Download full list (CSV)
                      </a>
                    </p>
                  )}
                  <div className="mt-2 max-h-56 overflow-auto rounded-md border border-border bg-surface text-text">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-paper uppercase tracking-wide text-text-muted">
                        <tr>
                          <th className="px-3 py-2 font-medium">Change</th>
                          <th className="px-3 py-2 font-medium">Worker</th>
                          <th className="px-3 py-2 font-medium">Date</th>
                          <th className="px-3 py-2 font-medium">Previous</th>
                          <th className="px-3 py-2 font-medium">Uploaded</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {visibleChanges.map((item, i) => (
                          <tr key={`${item.workerId}-${item.workDate}-${i}`}>
                            <td className="px-3 py-2 font-medium">
                              {item.type === "ADDED" ? "Added" : "Changed"}
                            </td>
                            <td className="px-3 py-2">
                              <div className="font-medium">{item.workerCode || "—"}</div>
                              <div className="text-text-muted">{item.workerName || "—"}</div>
                            </td>
                            <td className="px-3 py-2">{formatDate(item.workDate)}</td>
                            <td className="px-3 py-2">{describeSnapshot(item.previous)}</td>
                            <td className="px-3 py-2">{describeSnapshot(item.uploaded)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}

              <label className="mt-3 flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={supersedeTimesheet}
                  onChange={(e) => setSupersedeTimesheet(e.target.checked)}
                  disabled={busy}
                />
                <span>
                  <span className="font-medium">Supersede the previous active timesheet</span>
                  <span className="block text-xs">
                    Required to import. Only one active timesheet is allowed per
                    company and month.
                  </span>
                </span>
              </label>
            </div>
          )}

          {(result?.identicalManualCount ?? 0) > 0 && (
            <div className="rounded-md border border-border bg-paper px-3 py-2 text-sm text-text-muted">
              {result.identicalManualCount} uploaded row
              {result.identicalManualCount === 1 ? " is" : "s are"} identical to existing manual
              records. On import those records are kept and re-labelled as timesheet records, not duplicated.
            </div>
          )}

          {/* ---------- Blockers: uploads never delete anything ---------- */}
          {removedRecords.length > 0 && (
            <div role="alert" className="rounded-md border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
              <p className="font-semibold">
                {removedCount} record{removedCount === 1 ? "" : "s"} in the
                active timesheet {removedCount === 1 ? "is" : "are"} missing from this upload.
              </p>
              <p className="mt-1">
                Uploads never delete existing records. Download the active
                timesheet, merge your new data into it so these records are
                kept, then upload the merged file.
              </p>
              {activeSourceUrl && (
                <a className="btn-secondary mt-2 inline-flex" href={activeSourceUrl} download>
                  Download active timesheet
                </a>
              )}
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-medium">View missing records</summary>
                {removedCount > removedRecords.length && reviewCsvUrl && (
                  <p className="mt-2 text-xs">
                    Showing the first {removedRecords.length} of {removedCount}.{" "}
                    <a className="underline" href={reviewCsvUrl} download>
                      Download full list (CSV)
                    </a>
                  </p>
                )}
                <div className="mt-2 max-h-48 overflow-auto rounded-md border border-border bg-surface text-text">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-paper uppercase tracking-wide text-text-muted">
                      <tr>
                        <th className="px-3 py-2 font-medium">Worker</th>
                        <th className="px-3 py-2 font-medium">Date</th>
                        <th className="px-3 py-2 font-medium">In active timesheet</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {removedRecords.map((item, i) => (
                        <tr key={`${item.workerId}-${item.workDate}-${i}`}>
                          <td className="px-3 py-2">
                            <div className="font-medium">{item.workerCode || "—"}</div>
                            <div className="text-text-muted">{item.workerName || "—"}</div>
                          </td>
                          <td className="px-3 py-2">{formatDate(item.workDate)}</td>
                          <td className="px-3 py-2">
                            {[item.previous?.role, item.previous?.hours != null ? `${item.previous.hours} h` : null, item.previous?.status]
                              .filter(Boolean)
                              .join(" · ") || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </div>
          )}

          {hasManualConflicts && (
            <div role="alert" className="rounded-md border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
              <p className="font-semibold">
                {manualConflictCount} manual record{manualConflictCount === 1 ? "" : "s"} overlap
                this upload
                {manualConflictCount === manualConflicts.length
                  ? ` (${manualWorkerCount} worker${manualWorkerCount === 1 ? "" : "s"})`
                  : ""}
                .
              </p>
              <p className="mt-1">
                Uploads never overwrite manual records. Remove these worker/date
                rows from the file, or resolve the manual records yourself, then
                upload again.
              </p>
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-medium">View conflicting records</summary>
                {manualConflictCount > manualConflicts.length && reviewCsvUrl && (
                  <p className="mt-2 text-xs">
                    Showing the first {manualConflicts.length} of {manualConflictCount}.{" "}
                    <a className="underline" href={reviewCsvUrl} download>
                      Download full list (CSV)
                    </a>
                  </p>
                )}
                <div className="mt-2 max-h-48 overflow-auto rounded-md border border-border bg-surface text-text">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-paper uppercase tracking-wide text-text-muted">
                      <tr>
                        <th className="px-3 py-2 font-medium">Worker</th>
                        <th className="px-3 py-2 font-medium">Date</th>
                        <th className="px-3 py-2 font-medium">Manual</th>
                        <th className="px-3 py-2 font-medium">Uploaded</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {manualConflicts.map((item, i) => (
                        <tr key={`${item.workerId}-${item.workDate}-${i}`}>
                          <td className="px-3 py-2">
                            <div className="font-medium">{item.workerCode || "—"}</div>
                            <div className="text-text-muted">{item.workerName || "—"}</div>
                          </td>
                          <td className="px-3 py-2">{formatDate(item.workDate)}</td>
                          <td className="px-3 py-2">
                            {item.existingRole ? `${item.existingRole} · ` : ""}
                            {item.existingStatus || "—"}
                            {item.existingHours != null ? ` · ${item.existingHours} h` : ""}
                          </td>
                          <td className="px-3 py-2">
                            {item.uploadedRole ? `${item.uploadedRole} · ` : ""}
                            {item.uploadedStatus || "—"}
                            {item.uploadedHours != null ? ` · ${item.uploadedHours} h` : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </div>
          )}

          {error && <p role="alert" className="text-sm text-danger">{error}</p>}

          {result?.preview?.length > 0 ? (
            <div className="max-h-72 overflow-auto rounded-md border border-border">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-paper text-xs uppercase tracking-wide text-text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">Worker</th>
                    <th className="px-3 py-2 font-medium">Role</th>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Hours</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {result.preview.map((record, index) => (
                    <tr key={`${record.workerId ?? ""}-${record.workDate ?? ""}-${index}`}>
                      <td className="px-3 py-2">
                        <div className="font-medium">{record.workerId || "—"}</div>
                        {record.workerName && (
                          <div className="text-xs text-text-muted">{record.workerName}</div>
                        )}
                      </td>
                      <td className="px-3 py-2">{record.role || record.roleId || "—"}</td>
                      <td className="px-3 py-2">{formatDate(record.workDate)}</td>
                      <td className="px-3 py-2">{record.hours ?? "—"}</td>
                      <td className="px-3 py-2">{record.status || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-text-muted">No preview rows were returned.</p>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={handleClose} disabled={busy}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleConfirm}
              disabled={!canImport}
            >
              {busy ? "Importing…" : hasTimesheetConflict ? "Replace & import" : "Confirm import"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}