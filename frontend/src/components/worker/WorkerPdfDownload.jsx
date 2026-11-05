import { useEffect, useState } from "react";
import {
  Download,
  LoaderCircle,
  X,
  FileText,
  BriefcaseBusiness,
} from "lucide-react";

const REPORT_OPTIONS = [
  { value: "one-year", label: "Recent 1 Year", description: "Work and payroll details" },
  { value: "selected-year", label: "Selected Year", description: "Work details, with optional payroll" },
];

function getDownloadName(disposition, fallback) {
  const encoded = disposition?.match(/filename\*\s*=\s*UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded.replace(/^"|"$/g, ""));
    } catch {
      // Use the regular filename or fallback instead.
    }
  }
  return disposition?.match(/filename\s*=\s*"?([^";]+)"?/i)?.[1] || fallback;
}

export default function WorkerPdfDownload({ workerId, workerCode }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("documents");
  const [period, setPeriod] = useState("six-months");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [includePayroll, setIncludePayroll] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event) {
      if (event.key === "Escape" && !downloading) setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, downloading]);

  function closeModal() {
    if (downloading) return;
    setOpen(false);
    setError("");
  }

  async function handleDownload() {
    if (downloading || !workerId) return;
    setDownloading(true);
    setError("");
    let objectUrl;

    try {
      const base = `/api/workers/${encodeURIComponent(workerId)}/pdf`;
      const params = new URLSearchParams();
      if (category === "work") {
        params.set("type", "work");
        params.set("period", period);
        params.set("includePayroll", String(includePayroll));

        if (period === "selected-year") {
          params.set("year", year);
        }
      }
      const pdfPath = params.size ? `${base}?${params.toString()}` : base;
      const response = await fetch(pdfPath, {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/pdf" },
      });

      if (!response.ok) {
        let message = `Download failed (${response.status})`;
        try {
          const payload = await response.json();
          message = payload?.error?.message || payload?.message || message;
        } catch {
          // The error response was not JSON.
        }
        throw new Error(message);
      }

      const contentType = response.headers.get("Content-Type") || "";
      if (!contentType.toLowerCase().includes("application/pdf")) {
        throw new Error("The server did not return a PDF.");
      }
      const blob = await response.blob();
      if (blob.size === 0) throw new Error("The downloaded PDF is empty.");

      objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      const fallback = `${workerCode || "worker"}-${category === "documents" ? "documents" : period}.pdf`;
      link.download = getDownloadName(response.headers.get("Content-Disposition"), fallback);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setOpen(false);
    } catch (err) {
      console.error("Worker PDF download failed:", err);
      setError(err.message || "Unable to download the worker PDF.");
    } finally {
      if (objectUrl) {
        window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 1000);
      }
      setDownloading(false);
    }
  }

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 12 }, (_, index) => currentYear - index);

  return (
    <>
      <button
        type="button"
        onClick={() => { setError(""); setOpen(true); }}
        className="btn-secondary inline-flex items-center gap-2"
      >
        <Download className="h-4 w-4" />
        Download PDF
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeModal();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="worker-pdf-title"
            className="w-full max-w-lg rounded-xl bg-white p-5 dark:bg-gray-900 shadow-xl"
          >
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 id="worker-pdf-title" className="text-lg font-semibold 	text-gray-900 dark:text-gray-100">
                  Download Worker PDF
                </h2>
                <p className="mt-1 text-sm 	text-gray-500 dark:text-gray-400">
                  {workerCode ? `Worker ${workerCode} · ` : ""}Select a report to download.
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                disabled={downloading}
                aria-label="Close dialog"
                className="rounded-lg p-1 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <button
                type="button"
                onClick={() => { setCategory("documents"); setError(""); }}
                aria-pressed={category === "documents"}
                className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition ${
                  category === "documents"
                  ? "border-blue-600 bg-blue-50 dark:border-blue-500 dark:bg-blue-950/40"
                  : "border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                }`}
              >
                <FileText className="h-5 w-5 shrink-0 	text-gray-600 dark:text-gray-400" />
                <span className="flex-1">
                  <span className="block text-sm font-semibold 	text-gray-900 dark:text-gray-100">Document Profile</span>
                  <span className="block text-xs 	text-gray-500 dark:text-gray-400">Worker information and document attachments</span>
                </span>
                <span className={`h-4 w-4 shrink-0 rounded-full border-4 ${category === "documents" ? "border-blue-600" : "border-gray-300"}`} />
              </button>

              <button
                type="button"
                onClick={() => { setCategory("work"); setError(""); }}
                aria-pressed={category === "work"}
                className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition ${
                  category === "work" ? "border-blue-600 bg-blue-50 dark:border-blue-500 dark:bg-blue-950/40" : "border-gray-200  hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                }`}
              >
                <BriefcaseBusiness className="h-5 w-5 shrink-0 	text-gray-600 dark:text-gray-400" />
                <span className="flex-1">
                  <span className="block text-sm font-semibold 	text-gray-900 dark:text-gray-100">Work Profile</span>
                  <span className="block text-xs 	text-gray-500 dark:text-gray-400">Monthly work records and optional payroll information</span>
                </span>
                <span className={`h-4 w-4 shrink-0 rounded-full border-4 ${category === "work" ? "border-blue-600 dark:border-blue-500" : "border-gray-300 dark:border-gray-600"}`} />
              </button>

              {category === "work" && (
                <fieldset className="space-y-2 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                  <legend className="px-1 text-sm font-medium 	text-gray-700 dark:text-gray-300">Reporting period</legend>
                  {REPORT_OPTIONS.map((option) => (
                    <label key={option.value} className="flex cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-gray-50 dark:hover:bg-gray-800">
                      <input
                        type="radio"
                        name="worker-pdf-period"
                        value={option.value}
                        checked={period === option.value}
                        onChange={() => { setPeriod(option.value); setError(""); }}
                        className="mt-1 accent-blue-600"
                      />
                      <span>
                        <span className="block text-sm font-medium 	text-gray-900 dark:text-gray-100">{option.label}</span>
                        <span className="block text-xs 	text-gray-500 dark:text-gray-400">{option.description}</span>
                      </span>
                    </label>
                  ))}
                  {period === "selected-year" && (
                  <div className="space-y-3 border-t border-gray-200 px-2 pt-3 dark:border-gray-700">
                    <label
                      htmlFor="worker-pdf-year"
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      Select year
                    </label>

                    <select
                      id="worker-pdf-year"
                      value={year}
                      onChange={(event) => setYear(event.target.value)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                    >
                      {years.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={includePayroll}
                    onChange={(event) => setIncludePayroll(event.target.checked)}
                    className="accent-blue-600"
                  />
                  Include Payroll Details
                </label>
                </fieldset>
              )}
            </div>

            {error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={closeModal} disabled={downloading} className="btn-secondary disabled:opacity-60">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDownload}
                disabled={downloading || !workerId}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {downloading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {downloading ? "Preparing PDF..." : "Download PDF"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
