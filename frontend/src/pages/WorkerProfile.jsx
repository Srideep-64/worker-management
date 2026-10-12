import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronLeft, FileText, User } from "lucide-react";

import Card from "../components/ui/Card.jsx";
import WorkCalendar from "../components/work-calender/WorkCalender.jsx";
import DocumentsPanel from "../components/worker/DocumentsPanel.jsx";
import EditWorkerModal from "../components/worker/EditWorkerModal.jsx";

import { api } from "../api/client.js";
import { useFetch, fmtDate } from "../hooks.js";

function Field({ label, value }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-text-muted">
        {label}
      </p>
      <p className="text-sm text-text">{value ?? "—"}</p>
    </div>
  );
}

function Avatar({ workerId, version }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-paper text-text-muted">
        <User className="h-7 w-7" strokeWidth={1.5} />
      </div>
    );
  }

  return (
    <img
      src={`/api/workers/${encodeURIComponent(workerId)}/documents/PHOTO/file?v=${version}`}
      alt=""
      onError={() => setFailed(true)}
      className="h-16 w-16 shrink-0 rounded-full bg-paper object-cover"
    />
  );
}

export default function WorkerProfile() {
  const { workerId } = useParams();

  const {
    data: workerData,
    error,
    loading,
    reload,
  } = useFetch(() => api.get(`/workers/${workerId}`), [workerId]);

  const worker = workerData?.worker ?? workerData;

  const [editing, setEditing] = useState(false);
  const [photoVersion, setPhotoVersion] = useState(0);

  if (loading && !worker) {
    return (
      <p className="py-10 text-center text-sm text-text-muted">
        Loading worker profile...
      </p>
    );
  }

  if (error || !worker) {
    return (
      <div className="space-y-4">
        <Link
          to="/workers"
          className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text"
        >
          <ChevronLeft className="h-4 w-4" />
          Workers
        </Link>

        <Card>
          <p className="text-sm text-danger">
            {error || "Worker not found."}
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Link
        to="/workers"
        className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text"
      >
        <ChevronLeft className="h-4 w-4" />
        Workers
      </Link>

      {/* Worker overview */}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar
              key={photoVersion}
              workerId={worker.id}
              version={photoVersion}
            />

            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-accent-dark">
                {worker.workerCode}
              </p>

              <h2 className="text-lg font-semibold text-text">
                {worker.name}
              </h2>

              <p className="text-sm text-text-muted">
                {worker.company?.name ||
                  worker.company?.code ||
                  "Company not specified"}
                {worker.jobTitle ? ` · ${worker.jobTitle}` : ""}
              </p>
            </div>
          </div>

          <button
            type="button"
            className="btn-secondary"
            onClick={() => setEditing(true)}
          >
            <FileText className="h-4 w-4" />
            Edit details
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-4 md:grid-cols-4">
          <Field label="Nationality" value={worker.nationality} />

          <Field
            label="Date of birth"
            value={
              worker.dateOfBirth ? fmtDate(worker.dateOfBirth) : null
            }
          />

          <Field label="Phone" value={worker.phone} />

          <Field
            label="Joining date"
            value={
              worker.joiningDate ? fmtDate(worker.joiningDate) : null
            }
          />
        </div>
      </Card>

      {/* Documents and work calendar */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card title="Identity documents" className="lg:col-span-2">
          <DocumentsPanel
            worker={worker}
            onPhotoChanged={() =>
              setPhotoVersion((version) => version + 1)
            }
          />
        </Card>

        <Card title="Work calendar" className="lg:col-span-3">
          <WorkCalendar workerId={worker.id} />
        </Card>
      </div>

      {editing && (
        <EditWorkerModal
          worker={worker}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            reload();
          }}
        />
      )}
    </div>
  );
}