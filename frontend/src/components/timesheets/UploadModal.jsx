
import { useState } from "react";
import { TriangleAlert } from "lucide-react";

import Modal from "../components/ui/Modal.jsx";
import { api } from "../api/client.js";
import { invalidateTimesheetCaches } from "../utils/timesheetCache.js";

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString();
}

function getValidationErrors(error) {
  const errors =
    error?.details?.errors ??
    error?.details ??
    error?.payload?.errors;

  return Array.isArray(errors) ? errors : [];
}

function getPreviousUaeMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );

  const currentMonth = new Date(
    Number(values.year),
    Number(values.month) - 1,
    1,
  );

  currentMonth.setMonth(currentMonth.getMonth() - 1);

  const year = currentMonth.getFullYear();
  const month = String(currentMonth.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}

export default function UploadModal({ companies, onClose, onDone }) {
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const [periodMonth, setPeriodMonth] = useState(getPreviousUaeMonth);
  const [file, setFile] = useState(null);

  const [step, setStep] = useState("form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [validationErrors, setValidationErrors] = useState([]);
  const [result, setResult] = useState(null);
  const [showManualConflictModal, setShowManualConflictModal] =
    useState(false);

  function resetForm() {
    setStep("form");
    setFile(null);
    setResult(null);
    setShowManualConflictModal(false);
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

      invalidateTimesheetCaches();

      setResult(response);
      setStep("preview");

      if ((response?.manualConflicts?.length ?? 0) > 0) {
        setShowManualConflictModal(true);
      }
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

  async function handleConfirm(replace = false, supersedeManual = false) {
    const uploadId = result?.upload?.id;

    if (!uploadId) {
      setError("Upload information is missing. Please upload the file again.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      await api.post(`/timesheets/${uploadId}/confirm`, {
        replace,
        supersedeManual,
      });

      setShowManualConflictModal(false);
      onDone();
    } catch (err) {
      const errors = getValidationErrors(err);

      if (errors.length > 0 || err?.status === 422) {
        setValidationErrors(errors);
        setStep("errors");
      } else if (
        err?.status === 409 &&
        err?.details?.manualConflicts?.length
      ) {
        setResult((current) => ({
          ...current,
          manualConflicts: err.details.manualConflicts,
        }));
        setShowManualConflictModal(true);
      } else if (err?.status === 409 && !replace) {
        setError(
          "An active timesheet already exists for this company and month. Use Replace & import if this upload should supersede it.",
        );
      } else {
        setError(err.message || "Failed to confirm timesheet.");
      }
    } finally {
      setBusy(false);
    }
  }

  function requestConfirm(replace = false) {
    if ((result?.manualConflicts?.length ?? 0) > 0) {
      setShowManualConflictModal(true);
      return;
    }

    handleConfirm(replace, false);
  }

  return (
    <Modal
      title="Upload timesheet"
      onClose={onClose}
      wide={step !== "form"}
    >
      {step === "form" && (
        <form onSubmit={handleUpload} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="timesheet-company">
                Company
              </label>

              <select
                id="timesheet-company"
                className="input"
                value={companyId}
                onChange={(event) => setCompanyId(event.target.value)}
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
              <label className="label" htmlFor="timesheet-month">
                Month
              </label>

              <input
                id="timesheet-month"
                type="month"
                className="input"
                value={periodMonth}
                max={new Intl.DateTimeFormat("en-CA", {
                  timeZone: "Asia/Dubai",
                  year: "numeric",
                  month: "2-digit",
                })
                  .formatToParts(new Date())
                  .filter(
                    ({ type }) => type === "year" || type === "month",
                  )
                  .map(({ type, value }) =>
                    type === "year" ? value : `-${value}`,
                  )
                  .join("")}
                onChange={(event) => setPeriodMonth(event.target.value)}
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
              onChange={(event) =>
                setFile(event.target.files?.[0] ?? null)
              }
              required
            />
          </div>

          <p className="text-xs text-text-muted">
            The workbook is validated before work records are imported.
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
              disabled={busy}
            >
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
            {validationErrors.length === 1 ? "" : "s"} found. Fix the
            workbook and upload it again.
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
                    <tr
                      key={`${item.sheet ?? ""}-${item.row ?? ""}-${item.field ?? ""}-${index}`}
                    >
                      <td className="px-3 py-2 text-text-muted">
                        {item.sheet || "—"}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-text-muted">
                        {item.row ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-text-muted">
                        {item.field || "—"}
                      </td>
                      <td className="px-3 py-2 text-text">
                        {item.message || "Unknown validation issue"}
                      </td>
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
            <button
              type="button"
              className="btn-secondary"
              onClick={resetForm}
              disabled={busy}
            >
              Try another file
            </button>

            <button
              type="button"
              className="btn-primary"
              onClick={onClose}
              disabled={busy}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {step === "preview" && (
        <div className="space-y-4">
          <div className="rounded-md border border-border bg-paper px-3 py-3 text-sm">
            <p className="font-medium text-text">
              File validated successfully.
            </p>
            <p className="mt-1 text-text-muted">
              Format: {result?.format || "—"} · Records:{" "}
              {result?.rowCount ?? 0}
            </p>
          </div>

          {result?.conflict && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-900">
              <p className="font-semibold">
                An active timesheet already exists.
              </p>
              <p className="mt-1">
                Replacing it may supersede the existing upload and its work
                records. Confirm only if this workbook should replace it.
              </p>
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}

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
                    <tr
                      key={`${record.workerId ?? ""}-${record.workDate ?? ""}-${index}`}
                    >
                      <td className="px-3 py-2">
                        <div className="font-medium">
                          {record.workerId || "—"}
                        </div>
                        {record.workerName && (
                          <div className="text-xs text-text-muted">
                            {record.workerName}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {record.role || record.roleId || "—"}
                      </td>
                      <td className="px-3 py-2">
                        {formatDate(record.workDate)}
                      </td>
                      <td className="px-3 py-2">
                        {record.hours ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        {record.status || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-text-muted">
              No preview rows were returned.
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>

            {result?.conflict ? (
              <button
                type="button"
                className="btn-primary"
                onClick={() => requestConfirm(true)}
                disabled={busy}
              >
                {busy ? "Importing…" : "Replace & import"}
              </button>
            ) : (
              <button
                type="button"
                className="btn-primary"
                onClick={() => requestConfirm(false)}
                disabled={busy}
              >
                {busy ? "Importing…" : "Confirm import"}
              </button>
            )}
          </div>
        </div>
      )}

      {showManualConflictModal && (
        <Modal
          title="Manual work records found"
          onClose={() => {
            if (!busy) setShowManualConflictModal(false);
          }}
          wide
        >
          <div className="space-y-4">
            <div className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950">
              <TriangleAlert className="mt-0.5 h-6 w-6 shrink-0 text-amber-700" />

              <div className="space-y-1">
                <p className="font-semibold">
                  This timesheet overlaps with existing manual work records.
                </p>
                <p className="text-sm">
                  Superseding will delete only the manual records for the same
                  workers and dates that are included in this uploaded
                  timesheet. Other manual records in the month will remain
                  unchanged.
                </p>
              </div>
            </div>

            <div className="rounded-md border border-border">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-paper px-3 py-2 text-sm">
                <span className="font-medium">
                  {result?.manualConflicts?.length ?? 0} conflicting record
                  {(result?.manualConflicts?.length ?? 0) === 1 ? "" : "s"}
                </span>

                <span className="text-text-muted">
                  {new Set(
                    (result?.manualConflicts ?? []).map(
                      (item) => item.workerCode,
                    ),
                  ).size}{" "}
                  affected worker
                  {new Set(
                    (result?.manualConflicts ?? []).map(
                      (item) => item.workerCode,
                    ),
                  ).size === 1
                    ? ""
                    : "s"}
                </span>
              </div>

              <div className="max-h-60 overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-paper text-xs uppercase tracking-wide text-text-muted">
                    <tr>
                      <th className="px-3 py-2 font-medium">Worker</th>
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">
                        Existing manual record
                      </th>
                      <th className="px-3 py-2 font-medium">
                        Uploaded record
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-border">
                    {(result?.manualConflicts ?? []).map((item, index) => (
                      <tr
                        key={`${item.workerId}-${item.workDate}-${index}`}
                      >
                        <td className="px-3 py-2">
                          <div className="font-medium">
                            {item.workerCode || "—"}
                          </div>
                          <div className="text-xs text-text-muted">
                            {item.workerName || "—"}
                          </div>
                        </td>

                        <td className="px-3 py-2">
                          {formatDate(item.workDate)}
                        </td>

                        <td className="px-3 py-2">
                          {item.existingStatus || "—"}
                          {item.existingHours != null
                            ? ` · ${item.existingHours} h`
                            : ""}
                        </td>

                        <td className="px-3 py-2">
                          {item.uploadedStatus || "—"}
                          {item.uploadedHours != null
                            ? ` · ${item.uploadedHours} h`
                            : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}

            <p className="text-sm text-text-muted">
              This action cannot be undone. Do you want to supersede these
              manual records?
            </p>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-md border border-red-300 bg-red-100 px-4 py-2 text-sm font-medium text-red-800 transition-colors hover:bg-red-200 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() =>
                  handleConfirm(result?.conflict ? true : false, true)
                }
                disabled={busy}
              >
                {busy ? "Importing…" : "Supersede"}
              </button>

              <button
                type="button"
                className="btn-secondary border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                onClick={() => setShowManualConflictModal(false)}
                disabled={busy}
              >
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
