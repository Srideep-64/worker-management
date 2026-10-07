import { useState } from "react";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import Badge from "../ui/Badge.jsx";
import EmptyState from "../ui/EmptyState.jsx";
import { api } from "../../api/client.js";
import { useFetch } from "../../hooks.js";

const CELL_TONE = {
  WORKED: "bg-success-soft text-success",
  ABSENT: "bg-danger-soft text-danger",
  HOLIDAY: "bg-info-soft text-info",
  WEEKLY_OFF: "bg-paper text-text-muted border border-border",
};

const SHORT = {
  ABSENT: "A",
  HOLIDAY: "H",
  WEEKLY_OFF: "W",
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const pad = (n) => String(n).padStart(2, "0");

const monthKey = (y, m) => `${y}-${pad(m + 1)}`;

function Stat({ label, value }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <p className="text-xs uppercase tracking-wide text-text-muted">
        {label}
      </p>

      <p className="text-lg font-semibold tabular-nums text-text">
        {value}
      </p>
    </div>
  );
}

function Breakdown({ title, rows }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-text-muted">
        {title}
      </p>

      {rows.length === 0 ? (
        <p className="text-sm text-text-muted">—</p>
      ) : (
        <ul className="space-y-0.5 text-sm">
          {rows.map((r) => (
            <li
              key={r.name}
              className="flex justify-between gap-4"
            >
              <span className="text-text">
                {r.name}
              </span>

              <span className="tabular-nums text-text-muted">
                {r.hours} h
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function WorkCalendar({ workerId }) {
  const now = new Date();

  const [ym, setYm] = useState({
    y: now.getFullYear(),
    m: now.getMonth(),
  });

  const [selected, setSelected] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [form, setForm] = useState({
    clientId: "",
    roleId: "",
    status: "WORKED",
    hours: "",
  });

  const month = monthKey(ym.y, ym.m);

  const {
    data,
    error,
    loading,
    reload,
  } = useFetch(
    () =>
      api.get(
        `/workers/${workerId}/work?month=${month}`
      ),
    [workerId, month]
  );

  const assignedClients = selected
  ? (data?.assignments || [])
      .filter(
        (assignment) =>
          assignment.startDate <= selected &&
          (!assignment.endDate ||
            assignment.endDate >= selected)
      )
      .map((assignment) => assignment.client)
  : [];

  const { data: rolesData } = useFetch(
    () => api.get("/roles"),
    []
  );

  const shift = (delta) => {
    const d = new Date(
      Date.UTC(ym.y, ym.m + delta, 1)
    );

    setYm({
      y: d.getUTCFullYear(),
      m: d.getUTCMonth(),
    });

    setSelected(null);
  };

  const daysInMonth = new Date(
    Date.UTC(ym.y, ym.m + 1, 0)
  ).getUTCDate();

  const offset =
    (new Date(
      Date.UTC(ym.y, ym.m, 1)
    ).getUTCDay() + 6) %
    7;

  const byDate = Object.fromEntries(
    (data?.records || []).map((r) => [
      r.date,
      r,
    ])
  );

  const sel = selected
    ? byDate[selected]
    : null;

  const title = new Date(
    Date.UTC(ym.y, ym.m, 1)
  ).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const s = data?.summary;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => shift(-1)}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <span className="w-40 text-center text-sm font-semibold text-text">
            {title}
          </span>

          <button
            type="button"
            className="btn-secondary"
            onClick={() => shift(1)}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            setSaveError("");
            setShowAddModal(true);
          }}
        >
          + Add work
        </button>

        <div className="hidden items-center gap-2 text-xs text-text-muted sm:flex">
          <Badge status="WORKED">Worked</Badge>
          <Badge status="ABSENT">Absent</Badge>
          <Badge status="HOLIDAY">Holiday</Badge>
          <Badge status="WEEKLY_OFF">
            Weekly off
          </Badge>
        </div>
      </div>

      {error && (
        <p className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="pb-1 text-center text-xs font-medium text-text-muted"
          >
            {d}
          </div>
        ))}

        {Array.from(
          { length: offset },
          (_, i) => (
            <div key={`o${i}`} />
          )
        )}

        {Array.from(
          { length: daysInMonth },
          (_, i) => {
            const day = i + 1;
            const key = `${month}-${pad(day)}`;
            const r = byDate[key];

            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelected(key)}
                className={`flex h-14 flex-col items-start justify-between rounded-md p-1.5 text-left text-xs transition-colors ${
                  r
                    ? CELL_TONE[r.status]
                    : "border border-dashed border-border text-text-muted"
                } ${
                  selected === key
                    ? "ring-2 ring-accent"
                    : ""
                }`}
              >
                <span className="font-medium">
                  {day}
                </span>

                <span className="self-end text-sm font-semibold tabular-nums">
                  {r
                    ? r.status === "WORKED"
                      ? r.hours
                      : SHORT[r.status]
                    : ""}
                </span>
              </button>
            );
          }
        )}
      </div>

      {!loading &&
        data?.records.length === 0 && (
          <EmptyState
            title="No work records this month"
            description="Records appear here once a timesheet covering this worker and month is imported."
          />
        )}

      {selected && (
        <div className="rounded-md border border-border bg-paper p-4 text-sm">
          <p className="font-semibold text-text">
            {new Date(
              selected + "T00:00:00Z"
            ).toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            })}
          </p>

          {sel ? (
            <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 md:grid-cols-4">
              <div>
                <span className="text-text-muted">
                  Status:{" "}
                </span>

                <Badge status={sel.status} />
              </div>

              <div>
                <span className="text-text-muted">
                  Hours:{" "}
                </span>

                {sel.hours ?? "—"}
              </div>

              <div>
                <span className="text-text-muted">
                  Role:{" "}
                </span>

                {sel.role.code} — {sel.role.name}
              </div>

              <div>
                <span className="text-text-muted">
                  Client:{" "}
                </span>

                {sel.client.name}
              </div>

              {sel.upload && (
                <div className="col-span-2 md:col-span-4">
                  <a
                    className="inline-flex items-center gap-1 text-accent-dark hover:underline"
                    href={`/api/timesheets/${sel.upload.id}/source`}
                  >
                    <Download className="h-3.5 w-3.5" />
                    View source timesheet (
                    {sel.upload.originalFilename}
                    )
                  </a>
                </div>
              )}

              {sel.source === "MANUAL" && (
                <div className="col-span-2 md:col-span-4">
                  <span className="text-xs text-text-muted">
                    Source: Manual entry
                  </span>
                </div>
              )}
            </div>
          ) : (
            <p className="mt-1 text-text-muted">
              No record for this day.
            </p>
          )}
        </div>
      )}

      {s && data.records.length > 0 && (
        <div className="space-y-4 border-t border-border pt-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat
              label="Total hours"
              value={s.totalHours}
            />

            <Stat
              label="Worked days"
              value={s.workedDays}
            />

            <Stat
              label="Absent"
              value={s.absentDays}
            />

            <Stat
              label="Holidays"
              value={s.holidays}
            />

            <Stat
              label="Weekly offs"
              value={s.weeklyOffs}
            />
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Breakdown
              title="Hours by role"
              rows={s.byRole}
            />

            <Breakdown
              title="Hours by client"
              rows={s.byClient}
            />
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-lg bg-paper p-6">
            <h2 className="text-lg font-semibold text-text">
              Add work
            </h2>

            <p className="mt-2 text-sm text-text-muted">
              Date:{" "}
              {selected || "Select a day from the calendar first"}
            </p>

            <select
              className="mt-4 w-full rounded-md border border-border bg-paper px-3 py-2 text-sm text-text"
              value={form.clientId}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  clientId: e.target.value,
                }))
              }
            >
              <option value="" disabled>
                Select client
              </option>

             {assignedClients.map((client) => (
              <option
                key={client.id}
                value={client.id}
              >
                {client.code} — {client.name}
              </option>
            )
            )}
            </select>

            <select
              className="mt-3 w-full rounded-md border border-border bg-paper px-3 py-2 text-sm text-text"
              value={form.roleId}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  roleId: e.target.value,
                }))
              }
            >
              <option value="" disabled>
                Select role
              </option>

              {(rolesData?.roles || []).map(
                (role) => (
                  <option
                    key={role.id}
                    value={role.id}
                  >
                    {role.code} — {role.name}
                  </option>
                )
              )}
            </select>

            <select
              className="mt-3 w-full rounded-md border border-border bg-paper px-3 py-2 text-sm text-text"
              value={form.status}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  status: e.target.value,
                  hours:
                    e.target.value === "WORKED"
                      ? prev.hours
                      : "",
                }))
              }
            >
              <option value="WORKED">
                Worked
              </option>

              <option value="ABSENT">
                Absent
              </option>

              <option value="HOLIDAY">
                Holiday
              </option>

              <option value="WEEKLY_OFF">
                Weekly off
              </option>
            </select>

            {form.status === "WORKED" && (
              <input
                type="number"
                min="0"
                max="24"
                step="1"
                placeholder="Hours"
                value={form.hours}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    hours: e.target.value,
                  }))
                }
                className="mt-3 w-full rounded-md border border-border bg-paper px-3 py-2 text-sm text-text"
              />
            )}

            {saveError && (
              <p className="mt-3 text-sm text-danger">
                {saveError}
              </p>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setShowAddModal(false);
                  setSaveError("");
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                className="btn-primary"
                disabled={
                  !selected ||
                  !form.clientId ||
                  !form.roleId ||
                  (form.status === "WORKED" &&
                    !form.hours)
                }
                onClick={async () => {
                  try {
                    setSaveError("");

                    if (!selected) {
                      setSaveError(
                        "Please select a day from the calendar first."
                      );
                      return;
                    }

                    const workDate = selected;

                    await api.post(
                      `/workers/${workerId}/work`,
                      {
                        clientId: form.clientId,
                        roleId: form.roleId,
                        workDate,
                        status: form.status,
                        hours:
                          form.status === "WORKED"
                            ? Number(form.hours)
                            : undefined,
                      }
                    );

                    await reload();

                    setShowAddModal(false);

                    setForm({
                      clientId: "",
                      roleId: "",
                      status: "WORKED",
                      hours: "",
                    });
                  } catch (err) {
                    setSaveError(
                      err.message ||
                        "Failed to save work record"
                    );
                  }
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}