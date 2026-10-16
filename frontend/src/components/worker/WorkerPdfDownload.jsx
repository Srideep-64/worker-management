import { useState } from "react";
import { Download, LoaderCircle } from "lucide-react";

export default function WorkerPdfDownload({ workerId, workerCode }) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  

  async function handleDownload() {
    if (downloading) return;

    setDownloading(true);
    setError("");

    let objectUrl;

    try {
      const pdfPath =
  `/api/workers/${encodeURIComponent(workerId)}/pdf`;

const response = await fetch(pdfPath, {
  method: "GET",
  credentials: "include",
  headers: {
    Accept: "application/pdf",
  },
});

      if (!response.ok) {
        let message = `Download failed (${response.status})`;

        try {
          const payload = await response.json();
          message =
            payload?.error?.message ||
            payload?.message ||
            message;
        } catch {
          // The error response was not JSON.
        }

        throw new Error(message);
      }

      const blob = await response.blob();

      if (blob.size === 0) {
        throw new Error("The downloaded PDF is empty.");
      }
    objectUrl = window.URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = objectUrl;

    const disposition = response.headers.get("Content-Disposition");
    const filenameMatch = disposition?.match(/filename\*=UTF-8''([^;]+)/i);

    link.download = filenameMatch
      ? decodeURIComponent(filenameMatch[1])
      : "worker-documents.pdf";

    document.body.appendChild(link);
    link.click();
    link.remove();
    } catch (err) {
      console.error("Worker PDF download failed:", err);
      setError(err.message || "Unable to download the worker PDF.");
    } finally {
      // Delay cleanup slightly so the browser can start the download.
      if (objectUrl) {
        window.setTimeout(() => {
          window.URL.revokeObjectURL(objectUrl);
        }, 1000);
      }

      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        className="btn-secondary inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {downloading ? (
          <LoaderCircle className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}

        {downloading ? "Preparing PDF..." : "Download PDF"}
      </button>

      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}