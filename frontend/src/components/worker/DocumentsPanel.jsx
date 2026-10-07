import { useRef, useState } from "react";
import { Eye, Download, Upload } from "lucide-react";
import { api, ApiError } from "../../api/client.js";
import { useFetch, fmtDate, DOC_LABELS } from "../../hooks.js";
import ExpiryBadge from "../ui/ExpiryBadge.jsx";

// Which worker fields belong to which document type.
const FIELDS = [
  { type: "PASSPORT", number: "passportNumber", expiry: "passportExpiry" },
  { type: "VISA", number: "visaNumber", expiry: "visaExpiry" },
  { type: "EMIRATES_ID", number: "emiratesIdNumber", expiry: "emiratesIdExpiry" },
  { type: "LABOUR_CARD", number: "labourCardNumber", expiry: null },
];

const kb = (n) => (n > 1024 * 1024 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);

function DocRow({ worker, spec, doc, onChanged }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const base = `/api/workers/${worker.id}/documents/${spec.type}/file`;

  async function pick(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    const fd = new FormData();
    fd.append("file", file);
    try {
      await api.put(`/workers/${worker.id}/documents/${spec.type}`, fd);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-text">{DOC_LABELS[spec.type]}</p>
          <p className="text-sm text-text-muted">{worker[spec.number] || "No number on file"}</p>
          {spec.expiry && worker[spec.expiry] && (
            <p className="mt-1 flex items-center gap-2 text-sm text-text-muted">
              Expires {fmtDate(worker[spec.expiry])} <ExpiryBadge date={worker[spec.expiry]} />
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {doc && (
            <>
              <a className="btn-secondary" href={base} target="_blank" rel="noreferrer" title="View"><Eye className="h-4 w-4" /></a>
              <a className="btn-secondary" href={`${base}?download=1`} title="Download"><Download className="h-4 w-4" /></a>
            </>
          )}
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => input.current.click()}>
            <Upload className="h-4 w-4" /> {doc ? "Replace" : "Upload"}
          </button>
          <input ref={input} type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={pick} />
        </div>
      </div>
      <p className="mt-1 text-xs text-text-muted">
        {doc ? `${doc.originalFilename} · ${kb(doc.fileSize)} · uploaded ${fmtDate(doc.uploadedAt)}` : "No file uploaded"}
      </p>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

export default function DocumentsPanel({ worker, onPhotoChanged }) {
  const { data, error, reload } = useFetch(() => api.get(`/workers/${worker.id}/documents`), [worker.id]);
  const byType = Object.fromEntries((data?.documents || []).map((d) => [d.type, d]));
  const changed = () => { reload(); onPhotoChanged?.(); };

  return (
    <div className="divide-y divide-border">
      {error && <p className="pb-2 text-sm text-danger">{error}</p>}
      {FIELDS.map((spec) => (
        <DocRow key={spec.type} worker={worker} spec={spec} doc={byType[spec.type]} onChanged={changed} />
      ))}
      <DocRow worker={worker} spec={{ type: "PHOTO", number: null, expiry: null }} doc={byType.PHOTO} onChanged={changed} />
    </div>
  );
}
