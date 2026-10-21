
import { useEffect, useState } from "react";
import { Download, FileSpreadsheet, X } from "lucide-react";

import { api } from "../../api/client.js";

const statusStyles = {
  PROCESSING: "bg-blue-100 text-blue-700",
  ACTIVE: "bg-green-100 text-green-700",
  SUPERSEDED: "bg-gray-100 text-gray-600",
  FAILED: "bg-red-100 text-red-700",
};

function formatUaeTime(timestamp) {
  if (!timestamp) return "—";

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-GB", {
    timeZone: "Asia/Dubai",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function formatPeriod(periodMonth) {
  if (!periodMonth) return "—";

  const [year, month] = periodMonth.split("-");
  const monthName = new Date(Number(year), Number(month) - 1)
    .toLocaleString("en-US", { month: "short" });

  return `${monthName}-${year}`;
}

export default function TimesheetDetailsModal({
  uploadId,
  onClose,
}) {
  const [upload, setUpload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    setUpload(null);
    setLoading(true);
    setError("");

    api
      .get(`/timesheets/${uploadId}`)
      .then((data) => {
        if (!cancelled) {
          setUpload(data.upload || data);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err.message || "Failed to load timesheet details.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [uploadId]);

  // Close the modal when Escape is pressed.
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="timesheet-modal-title"
        className="w-full max-w-2xl overflow-hidden rounded-xl border border-gray-200 bg-surface text-gray-900 shadow-2xl dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div className="flex min-w-0 items-start gap-3">
            <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
              <FileSpreadsheet className="h-6 w-6" />
            </div>

            <div className="min-w-0">
              <h2
                id="timesheet-modal-title"
                className="text-lg font-semibold"
              >
                Timesheet Details
              </h2>

              <p className="mt-1 break-all text-sm text-text-muted">
                {upload?.originalFilename || "Original timesheet"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close timesheet details"
            className="rounded-md p-2 text-text-muted hover:bg-gray-100 hover:text-text"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5">
          {loading ? (
            <p className="py-8 text-center text-sm text-text-muted">
              Loading timesheet details...
            </p>
          ) : error ? (
            <div
              role="alert"
              className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
            >
              {error}
            </div>
          ) : upload ? (
            <>
              <dl className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <dt className="text-sm text-text-muted">
                    Company
                  </dt>
                  <dd className="mt-1 break-words text-sm font-medium">
                    {upload.company?.name || upload.companyId || "—"}
                  </dd>
                </div>

                <div>
                  <dt className="text-sm text-text-muted">
                    Period
                  </dt>
                  <dd className="mt-1 text-sm font-medium">
                    { formatPeriod(upload.periodMonth) || "—"}
                  </dd>
                </div>

                <div>
                  <dt className="text-sm text-text-muted">
                    Status
                  </dt>
                  <dd className="mt-1">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                        statusStyles[upload.status] ||
                        "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {upload.status || "—"}
                    </span>
                  </dd>
                </div>

                <div>
                  <dt className="text-sm text-text-muted">
                    Rows
                  </dt>
                  <dd className="mt-1 text-sm font-medium">
                    {upload.rowCount ?? 0}
                  </dd>
                </div>

                <div>
                  <dt className="text-sm text-text-muted">
                    Uploaded by
                  </dt>
                  <dd className="mt-1 text-sm font-medium">
                    {upload.uploadedBy?.name || "—"}
                  </dd>
                </div>

                <div>
                  <dt className="text-sm text-text-muted">
                    Uploaded at (UAE time)
                  </dt>
                  <dd className="mt-1 text-sm font-medium">
                    {formatUaeTime(upload.uploadedAt)}
                  </dd>
                </div>
              </dl>

              {upload.errorMessage && (
                <div className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                  {upload.errorMessage}
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap justify-end gap-3 border-t border-border p-5">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary"
          >
            Close
          </button>

          <a
            href={`/api/timesheets/${uploadId}/source`}
            className="btn-primary inline-flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            Download original file
          </a>
        </div>
      </div>
    </div>
  );
}
