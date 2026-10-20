import { useState } from "react";
import { Link, useParams, useLocation } from "react-router-dom";
import { ChevronLeft, FileText, User, CalendarClock, ChevronDown, ChevronUp} from "lucide-react";

import Card from "../components/ui/Card.jsx";
import WorkCalendar from "../components/work-calendar/WorkCalendar.jsx";
import WorkSummary from "../components/work-calendar/WorkSummary.jsx";
import PayrollSummary from "../components/work-calendar/PayrollSummary.jsx";
import DocumentsPanel from "../components/worker/DocumentsPanel.jsx";
import EditWorkerModal from "../components/worker/EditWorkerModal.jsx";
import ChangeWorkerStatusModal from "../components/worker/ChangeWorkerStatusModal.jsx";

import { api,invalidate } from "../api/client.js";
import { useFetch, fmtDate } from "../hooks.js";

import WorkerPdfDownload from "../components/worker/WorkerPdfDownload.jsx";

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

export default function WorkerProfile() {
  const { workerId } = useParams();

  const {
    data: workerData,
    error,
    loading,
    reload,
  } = useFetch(() => api.get(`/workers/${workerId}`),
   [workerId]);

  const worker = workerData?.worker ?? workerData;

  const [editing, setEditing] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [documentsExpanded, setDocumentsExpanded] = useState(false);

  const location = useLocation();

  const returnTo = location.state?.returnTo || "/workers";
  const returnLabel = location.state?.returnLabel || "Workers";

  const [selectedMonth, setSelectedMonth] = useState(() => {
    if (location.state?.profileMonth) {
      return location.state.profileMonth;
    }

    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const [workRefreshKey, setWorkRefreshKey] = useState(0);

  function notifyWorkUpdated() {
    setWorkRefreshKey((key) => key + 1);
  }

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
      to={returnTo}
      state={{
        activeTab: location.state?.returnTab || "Workers",
        workerPage: location.state?.returnWorkerPage ?? 1,
        workerStatus: location.state?.returnWorkerStatus || "ACTIVE",
        month: location.state?.returnMonth,
      }}
      className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text"
    >
      <ChevronLeft className="h-4 w-4" />
      {returnLabel}
    </Link>

      {/* Worker overview */}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-paper text-text-muted">
              <User className="h-7 w-7" strokeWidth={1.5} />
            </div>

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
               <span
                className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                  worker.status === "ACTIVE"
                    ? "bg-green-100 text-green-800"
                    : "bg-red-100 text-red-800"
                }`}
              >
                {worker.status === "ACTIVE" ? "Active" : "Inactive"}
              </span>
          </div>


        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setEditing(true)}
          >
            <FileText className="h-4 w-4" />
            Edit details
          </button>

          <button
            type="button"
            className="btn-secondary"
            onClick={() => setChangingStatus(true)}
          >
            <CalendarClock className="h-4 w-4" />
            Change status
          </button>

          <WorkerPdfDownload
            workerId={worker.id}
            workerCode={worker.workerCode}
          />
        </div>

        </div>

        <div className="mt-5 grid grid-cols-3 gap-4 border-t border-border pt-4 md:grid-cols-4">

          <Field label="Phone" value={worker.phone} />

          <Field
            label="Joining date"
            value={
              worker.joiningDate ? fmtDate(worker.joiningDate) : null
            }
          />
          <Field
            label="Leaving date"
            value={
              worker.leavingDate ? fmtDate(worker.leavingDate) : null
            }
          />
        </div>
      </Card>

      {/* Documents and work calendar */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      <Card className="lg:col-span-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-text">
            Identity documents
          </h2>

          <button
            type="button"
            onClick={() => setDocumentsExpanded((expanded) => !expanded)}
            aria-expanded={documentsExpanded}
            className="btn-secondary inline-flex shrink-0 items-center gap-2"
          >
            {documentsExpanded ? "Hide documents" : "Show documents"}

            {documentsExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
        </div>

        {documentsExpanded && (
          <div className="mt-4">
            <DocumentsPanel
              worker={worker}
            />
          </div>
        )}
      </Card>

      <Card title="Work calendar" className="lg:col-span-3">
        <WorkCalendar
          workerId={worker.id}
          companyId={worker.companyId}
          initialMonth={location.state?.profileMonth}
          onMonthChange={setSelectedMonth}
          onWorkUpdated={notifyWorkUpdated}
        />
      </Card>
</div>
    {/* Summary cards */}
    <div className="grid grid-cols-1 gap-6 md:grid-cols-1 lg:grid-cols-2">
      <div> 
      <WorkSummary
        workerId={worker.id}
        month={selectedMonth}
        refreshKey={workRefreshKey}
      />
      </div>
        <div> 
      <PayrollSummary
        workerId={worker.id}
        companyId={worker.companyId}
        month={selectedMonth}
        refreshKey={workRefreshKey}
      />
      </div>
    </div>
      

      {editing && (
        <EditWorkerModal
          worker={worker}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            invalidate("/workers", "/companies", "/dashboard","documents");
            reload();
          }}
        />
      )}
      
        {changingStatus && (
          <ChangeWorkerStatusModal
            worker={worker}
            onClose={() => setChangingStatus(false)}
            onSaved={() => {
              setChangingStatus(false);
              invalidate("/workers", "/companies", "/dashboard","/documents");
              reload();
            }}
          />
        )}

    </div>
  );
}