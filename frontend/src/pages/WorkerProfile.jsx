import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ChevronLeft,
  FileText,
  Plus,
  User,
  X,
} from "lucide-react";

import Card from "../components/ui/Card.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";
import WorkCalendar from "../components/worker/WorkCalender.jsx";
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

function AssignmentStatus({ endDate }) {
  const active = !endDate;

  return (
    <span
      className={
        active
          ? "rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700"
          : "rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600"
      }
    >
      {active ? "Active" : "Ended"}
    </span>
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

  const {
    data: clientData,
    error: clientsError,
  } = useFetch(() => api.get("/clients"), []);

  const worker = workerData?.worker ?? workerData;
  const clients = clientData?.clients ?? [];
  const activeClients = useMemo(
    () => clients.filter((client) => client.active),
    [clients],
  );

  const [assignments, setAssignments] = useState([]);
  const [assignmentsAvailable, setAssignmentsAvailable] = useState(null);

  const [editing, setEditing] = useState(false);
  const [photoVersion, setPhotoVersion] = useState(0);

  const [showAssignmentForm, setShowAssignmentForm] = useState(false);
  const [clientId, setClientId] = useState("");
  const [startDate, setStartDate] = useState(() => {
    const now = new Date();
    const localDate = new Date(
      now.getTime() - now.getTimezoneOffset() * 60_000,
    );
    return localDate.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState("");
  const [savingAssignment, setSavingAssignment] = useState(false);
  const [assignmentError, setAssignmentError] = useState("");

  // Prefer the dedicated assignment-history endpoint; use embedded data as fallback.
  useEffect(() => {
    let cancelled = false;

    setAssignments(worker?.assignments ?? []);
    setAssignmentsAvailable(null);

    async function loadAssignments() {
      try {
        const data = await api.get(`/workers/${workerId}/assignments`);

        if (!cancelled) {
          setAssignments(data.assignments ?? []);
          setAssignmentsAvailable(true);
        }
      } catch {
        if (!cancelled) {
          setAssignments(worker?.assignments ?? []);
          setAssignmentsAvailable(
            Array.isArray(worker?.assignments) ? true : false,
          );
        }
      }
    }

    if (workerId) loadAssignments();

    return () => {
      cancelled = true;
    };
  }, [workerId, worker?.assignments]);

  const activeAssignment = assignments.find(
    (assignment) => !assignment.endDate,
  );

  async function handleAssignmentSubmit(event) {
    event.preventDefault();
    setAssignmentError("");

    if (!clientId || !startDate) {
      setAssignmentError("Please select a client and start date.");
      return;
    }

    if (endDate && endDate < startDate) {
      setAssignmentError("End date cannot be before start date.");
      return;
    }

    setSavingAssignment(true);

    try {
      const payload = {
        clientId,
        startDate,
        ...(endDate ? { endDate } : {}),
      };

      const response = await api.post(
        `/workers/${workerId}/assignments`,
        payload,
      );

      if (response.assignment) {
        setAssignments((current) =>
          [response.assignment, ...current].sort(
            (a, b) => new Date(b.startDate) - new Date(a.startDate),
          ),
        );
      } else {
        const refreshed = await api.get(
          `/workers/${workerId}/assignments`,
        );
        setAssignments(refreshed.assignments ?? []);
      }

      setAssignmentsAvailable(true);
      setClientId("");
      setEndDate("");
      setShowAssignmentForm(false);
    } catch (err) {
      setAssignmentError(
        err.message || "Failed to create client assignment.",
      );
    } finally {
      setSavingAssignment(false);
    }
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
                {worker.company?.name || worker.company?.code || "Company not specified"}
                {worker.jobTitle ? ` · ${worker.jobTitle}` : ""}
              </p>
              <p className="mt-1 text-sm text-text-muted">
                Current client:{" "}
                <span className="font-medium text-text">
                  {activeAssignment?.client?.name || "Not assigned"}
                </span>
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
            value={worker.dateOfBirth ? fmtDate(worker.dateOfBirth) : null}
          />
          <Field label="Phone" value={worker.phone} />
          <Field
            label="Joining date"
            value={worker.joiningDate ? fmtDate(worker.joiningDate) : null}
          />
        </div>
      </Card>

      {/* Documents and work calendar */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card title="Identity documents" className="lg:col-span-2">
          <DocumentsPanel
            worker={worker}
            onPhotoChanged={() => setPhotoVersion((version) => version + 1)}
          />
        </Card>

        <Card title="Work calendar" className="lg:col-span-3">
          <WorkCalendar workerId={worker.id} />
        </Card>
      </div>

      {/* Client assignment history */}
      <Card
        title="Client history"
        action={
          <button
            type="button"
            className="btn-accent"
            onClick={() => {
              setShowAssignmentForm((current) => !current);
              setAssignmentError("");
            }}
          >
            {showAssignmentForm ? (
              <X className="h-4 w-4" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {showAssignmentForm ? "Cancel" : "Assign client"}
          </button>
        }
      >
        {showAssignmentForm && (
          <form
            onSubmit={handleAssignmentSubmit}
            className="mb-6 grid gap-4 rounded-xl border border-border p-4 sm:grid-cols-3"
          >
            <div className="sm:col-span-3">
              <label className="label" htmlFor="assignment-client">
                Client *
              </label>
              <select
                id="assignment-client"
                className="input"
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
                required
              >
                <option value="">Select a client</option>
                {activeClients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.code} — {client.name}
                  </option>
                ))}
              </select>

              {clientsError && (
                <p className="mt-1 text-xs text-danger">
                  Could not load clients. Please refresh and try again.
                </p>
              )}
            </div>

            <div>
              <label className="label" htmlFor="assignment-start">
                Start date *
              </label>
              <input
                id="assignment-start"
                type="date"
                className="input"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                required
              />
            </div>

            <div>
              <label className="label" htmlFor="assignment-end">
                End date
              </label>
              <input
                id="assignment-end"
                type="date"
                className="input"
                value={endDate}
                min={startDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
              <p className="mt-1 text-xs text-text-muted">
                Leave blank for an ongoing assignment.
              </p>
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                className="btn-accent w-full"
                disabled={savingAssignment || activeClients.length === 0}
              >
                {savingAssignment ? "Saving..." : "Save assignment"}
              </button>
            </div>

            {activeClients.length === 0 && !clientsError && (
              <p className="text-sm text-text-muted sm:col-span-3">
                No active clients are available to assign.
              </p>
            )}

            {assignmentError && (
              <p className="rounded-lg bg-danger-soft p-3 text-sm text-danger sm:col-span-3">
                {assignmentError}
              </p>
            )}
          </form>
        )}

        {assignmentsAvailable === false ? (
          <EmptyState
            title="Assignment history unavailable"
            description="The worker assignment history could not be loaded."
          />
        ) : assignments.length === 0 ? (
          <EmptyState
            title="No assignments yet"
            description="Client assignments will appear here once recorded."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[540px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
                  <th className="px-3 py-3 font-medium">Client</th>
                  <th className="px-3 py-3 font-medium">Start date</th>
                  <th className="px-3 py-3 font-medium">End date</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                </tr>
              </thead>

              <tbody>
                {assignments.map((assignment) => (
                  <tr
                    key={assignment.id}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-3 py-3">
                      <p className="font-medium text-text">
                        {assignment.client?.name || "—"}
                      </p>
                      <p className="text-xs text-text-muted">
                        {assignment.client?.code || ""}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-text-muted">
                      {fmtDate(assignment.startDate)}
                    </td>
                    <td className="px-3 py-3 text-text-muted">
                      {assignment.endDate
                        ? fmtDate(assignment.endDate)
                        : "Current"}
                    </td>
                    <td className="px-3 py-3">
                      <AssignmentStatus endDate={assignment.endDate} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

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