import { useState } from "react";
import { Download, FileSpreadsheet, RefreshCw, Upload } from "lucide-react";

import Card from "../components/ui/Card.jsx";
import Badge from "../components/ui/Badge.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";
import Modal from "../components/ui/Modal.jsx";

import { api, qs } from "../api/client.js";
import { useFetch, fmtMonth } from "../hooks.js";

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

function UploadModal({ companies, onClose, onDone }) {
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const [periodMonth, setPeriodMonth] = useState("");
  const [file, setFile] = useState(null);

  const [step, setStep] = useState("form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [validationErrors, setValidationErrors] = useState([]);
  const [result, setResult] = useState(null);

  function resetForm() {
    setStep("form");
    setFile(null);
    setResult(null);
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

      setResult(response);
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

  async function handleConfirm(replace = false) {
    const uploadId = result?.upload?.id;

    if (!uploadId) {
      setError("Upload information is missing. Please upload the file again.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      await api.post(`/timesheets/${uploadId}/confirm`, { replace });
      onDone();
    } catch (err) {
      const errors = getValidationErrors(err);

      if (errors.length > 0 || err?.status === 422) {
        setValidationErrors(errors);
        setStep("errors");
      } else if (err?.status === 409 && !replace) {
        setError(
          "An active timesheet already exists for this company and month. Use Replace & import if this upload should supersede it."
        );
      } else {
        setError(err.message || "Failed to confirm timesheet.");
      }
    } finally {
      setBusy(false);
    }
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
            <p className="font-medium text-text">File validated successfully.</p>
            <p className="mt-1 text-text-muted">
              Format: {result?.format || "—"} · Records: {result?.rowCount ?? 0}
            </p>
          </div>

          {result?.conflict && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-900">
              <p className="font-semibold">An active timesheet already exists.</p>
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
                    <th className="px-3 py-2 font-medium">Client</th>
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
                      <td className="px-3 py-2">{record.workerId || "—"}</td>
                      <td className="px-3 py-2">{record.clientId || "—"}</td>
                      <td className="px-3 py-2">{record.roleId || "—"}</td>
                      <td className="px-3 py-2">{formatDate(record.workDate)}</td>
                      <td className="px-3 py-2">{record.hours ?? "—"}</td>
                      <td className="px-3 py-2">{record.status || "—"}</td>
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
                onClick={() => handleConfirm(true)}
                disabled={busy}
              >
                {busy ? "Importing…" : "Replace & import"}
              </button>
            ) : (
              <button
                type="button"
                className="btn-primary"
                onClick={() => handleConfirm(false)}
                disabled={busy}
              >
                {busy ? "Importing…" : "Confirm import"}
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function Timesheets() {
  const [companyId, setCompanyId] = useState("");
  const [status, setStatus] = useState("");
  const [showUpload, setShowUpload] = useState(false);

  const companiesQuery = useFetch(
    async () => {
      const response = await api.get("/companies");
      return response.companies || [];
    },
    []
  );

  const {
    data,
    error,
    loading,
    reload,
  } = useFetch(
    () =>
      api.get(
        `/timesheets${qs({
          companyId,
          status,
          pageSize: 50,
        })}`
      ),
    [companyId, status]
  );

  const companies = companiesQuery.data || [];
  const uploads = data?.uploads || [];

  return (
    <Card
      title="Timesheets"
      action={
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-secondary inline-flex items-center gap-2"
            onClick={reload}
            disabled={loading}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>

          <button
            type="button"
            className="btn-accent inline-flex items-center gap-2"
            onClick={() => setShowUpload(true)}
            disabled={companiesQuery.loading || companies.length === 0}
          >
            <Upload className="h-4 w-4" />
            Upload timesheet
          </button>
        </div>
      }
    >
      {companiesQuery.error && (
        <p role="alert" className="mb-4 text-sm text-danger">
          Failed to load companies:{" "}
          {companiesQuery.error.message || "Unknown error"}
        </p>
      )}

      {error && (
        <p role="alert" className="mb-4 text-sm text-danger">
          {error.message || "Failed to load timesheets."}
        </p>
      )}

      <div className="mb-5 flex flex-wrap gap-3">
        <select
          className="input w-auto"
          value={companyId}
          onChange={(event) => setCompanyId(event.target.value)}
          aria-label="Filter timesheets by company"
        >
          <option value="">All companies</option>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.code} — {company.name}
            </option>
          ))}
        </select>

        <select
          className="input w-auto"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          aria-label="Filter timesheets by status"
        >
          <option value="">All statuses</option>
          {["PROCESSING", "ACTIVE", "SUPERSEDED", "FAILED"].map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-text-muted">
          Loading timesheets…
        </p>
      ) : uploads.length === 0 ? (
        <EmptyState
          icon={FileSpreadsheet}
          title="No timesheets found"
          description="Try changing the filters or upload a monthly Excel file to get started."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
                <th className="px-3 py-3 font-medium">Company</th>
                <th className="px-3 py-3 font-medium">Month</th>
                <th className="px-3 py-3 font-medium">File</th>
                <th className="px-3 py-3 font-medium">Uploaded</th>
                <th className="px-3 py-3 font-medium">By</th>
                <th className="px-3 py-3 font-medium">Records</th>
                <th className="px-3 py-3 font-medium">Errors</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium text-right">Source</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-border">
              {uploads.map((upload) => (
                <tr key={upload.id}>
                  <td className="px-3 py-3 font-medium text-text">
                    {upload.company?.name || upload.company?.code || "—"}
                  </td>
                  <td className="px-3 py-3 text-text-muted">
                    {upload.periodMonth ? fmtMonth(upload.periodMonth) : "—"}
                  </td>
                  <td className="px-3 py-3 text-text-muted">
                    {upload.originalFilename || upload.fileName || "—"}
                  </td>
                  <td className="px-3 py-3 text-text-muted">
                    {formatDate(upload.uploadedAt || upload.createdAt)}
                  </td>
                  <td className="px-3 py-3 text-text-muted">
                    {upload.uploadedBy?.name || "—"}
                  </td>
                  <td className="px-3 py-3 tabular-nums text-text-muted">
                    {upload.rowCount ?? 0}
                  </td>
                  <td className="px-3 py-3 tabular-nums text-text-muted">
                    {upload.errorCount ?? 0}
                  </td>
                  <td className="px-3 py-3">
                    <Badge status={upload.status} />
                  </td>
                  <td className="px-3 py-3 text-right">
                    <a
                      className="inline-flex items-center gap-1 text-accent-dark hover:underline"
                      href={`/api/timesheets/${encodeURIComponent(upload.id)}/source`}
                    >
                      <Download className="h-3.5 w-3.5" />
                      Source
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showUpload && (
        <UploadModal
          companies={companies}
          onClose={() => setShowUpload(false)}
          onDone={() => {
            setShowUpload(false);
            reload();
          }}
        />
      )}
    </Card>
  );
}