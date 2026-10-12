
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import Badge from "../ui/Badge.jsx";
import EmptyState from "../ui/EmptyState.jsx";
import { api } from "../../api/client.js";
import { useFetch } from "../../hooks.js";

import WorkCalendarGrid from "./WorkCalendarGrid.jsx";
import WorkEntryForm from "./WorkEntryForm.jsx";
import ConfirmWorkChange from "./ConfirmWorkChange.jsx";
import WorkSummary from "./WorkSummary.jsx";

import {
  STATUS_FROM_KEY,
  monthKey,
  dateKey,
  parseDate,
  buildChanges,
  pad,
} from "./workCalendarUtils.js";

export default function WorkCalendar({ workerId }) {
  const today = dateKey(new Date());

  const [ym, setYm] = useState(() => {
    const now = new Date();

    return {
      y: now.getFullYear(),
      m: now.getMonth(),
    };
  });

  const [selected, setSelected] = useState(today);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [editRoleId, setEditRoleId] = useState("");
  const [entryValue, setEntryValue] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingEdit, setPendingEdit] = useState(null);

  const entryInputRef = useRef(null);

  const month = monthKey(ym.y, ym.m);

  const {
    data,
    error,
    loading,
    reload,
  } = useFetch(
    () => api.get(`/workers/${workerId}/work?month=${month}`),
    [workerId, month],
  );

  const {
    data: rolesData,
    error: rolesError,
  } = useFetch(() => api.get("/roles"), []);

  const roles = rolesData?.roles ?? [];
  const records = data?.records ?? [];
  const summary = data?.summary;

  const byDate = Object.fromEntries(
    records.map((record) => [
      String(record.date).slice(0, 10),
      record,
    ]),
  );

  const selectedRecord = selected ? byDate[selected] : null;
  const isEditingManual = selectedRecord?.source === "MANUAL";

  // Load the existing role when navigating to a manual record.
  // Non-WORKED records display an empty role selection.
  useEffect(() => {
    if (!selectedRecord || selectedRecord.source !== "MANUAL") {
      setEditRoleId("");
      return;
    }

    setEditRoleId(
      selectedRecord.status === "WORKED"
        ? selectedRecord.role?.id ?? ""
        : "",
    );
  }, [
    selectedRecord?.id,
    selectedRecord?.source,
    selectedRecord?.status,
    selectedRecord?.role?.id,
  ]);

  // Focus the entry field when navigating between dates.
  useEffect(() => {
    if (!selectedRoleId && !isEditingManual) return;
    if (pendingEdit) return;

    const frame = requestAnimationFrame(() => {
      entryInputRef.current?.focus();
    });

    return () => cancelAnimationFrame(frame);
  }, [selected, selectedRoleId, isEditingManual, pendingEdit]);

  function clearPendingEntry() {
    setEntryValue("");
    setSaveError("");
    setPendingEdit(null);
  }

  // Keyboard navigation works while the entry field is focused.
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.altKey || event.ctrlKey || event.metaKey) return;

      const target = event.target;
      const tag = target?.tagName;

      if (
        tag === "SELECT" ||
        tag === "TEXTAREA" ||
        target?.isContentEditable
      ) {
        return;
      }

      if (
        event.key !== "ArrowLeft" &&
        event.key !== "ArrowRight"
      ) {
        return;
      }

      event.preventDefault();

      const currentDate = parseDate(selected || today);

      currentDate.setDate(
        currentDate.getDate() +
          (event.key === "ArrowRight" ? 1 : -1),
      );

      const nextKey = dateKey(currentDate);

      setSelected(nextKey);
      setYm({
        y: currentDate.getFullYear(),
        m: currentDate.getMonth(),
      });

      clearPendingEntry();
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selected, today]);

  function navigateDate(delta) {
    const currentDate = parseDate(selected || today);

    currentDate.setDate(currentDate.getDate() + delta);

    setSelected(dateKey(currentDate));
    setYm({
      y: currentDate.getFullYear(),
      m: currentDate.getMonth(),
    });

    clearPendingEntry();
  }

  function shiftMonth(delta) {
    const nextMonth = new Date(ym.y, ym.m + delta, 1);

    setYm({
      y: nextMonth.getFullYear(),
      m: nextMonth.getMonth(),
    });

    setSelected(dateKey(nextMonth));
    clearPendingEntry();
  }

  function selectDate(key) {
    setSelected(key);
    clearPendingEntry();
  }

  function parseEntry() {
    const raw = entryValue.trim().toUpperCase();

    if (!raw) {
      throw new Error("Enter hours or A, H, or W.");
    }

    if (Object.hasOwn(STATUS_FROM_KEY, raw)) {
      return {
        status: STATUS_FROM_KEY[raw],
        hours: null,
      };
    }

    const parsedHours = Number(raw);

    if (
      !Number.isFinite(parsedHours) ||
      parsedHours < 0 ||
      parsedHours > 24
    ) {
      throw new Error(
        'Invalid entry. Enter hours from 0 to 24, or "A", "H", or "W".',
      );
    }

    return {
      status: "WORKED",
      hours: parsedHours,
    };
  }

  async function handleEntrySubmit(event) {
    event?.preventDefault();

    if (saving || pendingEdit) return;

    if (!selected) {
      setSaveError("Select a date first.");
      return;
    }

    let next;

    try {
      next = parseEntry();
    } catch (err) {
      setSaveError(err.message);
      return;
    }

    const existing = byDate[selected];

    // Existing records: only manual records can be edited.
    if (existing) {
      if (existing.source !== "MANUAL") {
        setSaveError(
          "Timesheet records cannot be edited manually.",
        );
        return;
      }

      let nextRoleId;

      if (next.status === "WORKED") {
        nextRoleId =
          editRoleId ||
          (existing.status === "WORKED"
            ? existing.role?.id
            : "");

        if (!nextRoleId) {
          setSaveError(
            "Select a role when changing the record to Worked.",
          );
          return;
        }
      }

      const nextRole =
        next.status === "WORKED"
          ? roles.find((role) => role.id === nextRoleId) ??
            (existing.role?.id === nextRoleId
              ? existing.role
              : null)
          : null;

      if (next.status === "WORKED" && !nextRole) {
        setSaveError("The selected role could not be found.");
        return;
      }

      const changes = buildChanges(existing, next, nextRole);

      if (changes.length === 0) {
        setSaveError("No changes detected.");
        return;
      }

      setSaveError("");

      setPendingEdit({
        recordId: existing.id,
        date: selected,
        changes,
        payload: {
          status: next.status,
          ...(next.status === "WORKED"
            ? {
                hours: next.hours,
                roleId: nextRoleId,
              }
            : {}),
        },
      });

      return;
    }

    // New records save normally without a confirmation step.
    if (!selectedRoleId) {
      setSaveError("Select a role first.");
      return;
    }

    setSaving(true);
    setSaveError("");

    try {
      await api.post(`/workers/${workerId}/work`, {
        workDate: selected,
        roleId: selectedRoleId,
        status: next.status,
        ...(next.status === "WORKED"
          ? { hours: next.hours }
          : {}),
      });

      setEntryValue("");
      await reload();
    } catch (err) {
      setSaveError(
        err?.message || "Could not save this work record.",
      );
    } finally {
      setSaving(false);

      requestAnimationFrame(() => {
        entryInputRef.current?.focus();
      });
    }
  }

  async function confirmEdit() {
    if (!pendingEdit || saving) return;

    setSaving(true);
    setSaveError("");

    try {
      await api.patch(
        `/workers/${workerId}/work/${pendingEdit.recordId}`,
        pendingEdit.payload,
      );

      setPendingEdit(null);
      setEntryValue("");

      await reload();
    } catch (err) {
      setSaveError(
        err?.message || "Could not update this work record.",
      );
    } finally {
      setSaving(false);

      requestAnimationFrame(() => {
        entryInputRef.current?.focus();
      });
    }
  }

  function cancelEdit() {
    setPendingEdit(null);
    setEntryValue("");
    setSaveError("");

    requestAnimationFrame(() => {
      entryInputRef.current?.focus();
    });
  }

  const title = new Date(ym.y, ym.m, 1).toLocaleDateString(
    "en-GB",
    {
      month: "long",
      year: "numeric",
    },
  );

  const selectedTitle = selected
    ? parseDate(selected).toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "Select a date";

  return (
    <div className="space-y-5">
      {/* Month navigation and status legend */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => shiftMonth(-1)}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <span className="w-36 text-center text-sm font-semibold text-text">
            {title}
          </span>

          <button
            type="button"
            className="btn-secondary"
            onClick={() => shiftMonth(1)}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="hidden flex-wrap items-center gap-2 text-xs text-text-muted sm:flex">
          <Badge status="WORKED">Worked</Badge>
          <Badge status="ABSENT">Absent</Badge>
          <Badge status="HOLIDAY">Holiday</Badge>
          <Badge status="WEEKLY_OFF">Weekly off</Badge>
        </div>
      </div>

      {/* API errors */}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error.message || "Failed to load work records."}
        </p>
      )}

      {rolesError && (
        <p role="alert" className="text-sm text-danger">
          {rolesError.message || "Failed to load roles."}
        </p>
      )}

      {/* Calendar grid */}
      <WorkCalendarGrid
        year={ym.y}
        month={ym.m}
        selected={selected}
        byDate={byDate}
        onSelectDate={selectDate}
      />

      {!loading && records.length === 0 && (
        <EmptyState
          title="No work records this month"
          description="Select a date, choose a role, and enter the work details below."
        />
      )}

      {/* Selected date and work entry */}
      <WorkEntryForm
        workerId={workerId}
        selectedTitle={selectedTitle}
        selectedRecord={selectedRecord}
        roles={roles}
        selectedRoleId={selectedRoleId}
        setSelectedRoleId={setSelectedRoleId}
        editRoleId={editRoleId}
        setEditRoleId={setEditRoleId}
        entryValue={entryValue}
        setEntryValue={(value) => {
          setEntryValue(value);
          setSaveError("");
        }}
        entryInputRef={entryInputRef}
        saving={saving}
        pendingEdit={pendingEdit}
        saveError={saveError}
        onSubmit={handleEntrySubmit}
        onNavigateDate={navigateDate}
      />

      {/* Confirmation for editing existing manual records */}
      <ConfirmWorkChange
        pendingEdit={pendingEdit}
        saving={saving}
        onConfirm={confirmEdit}
        onCancel={cancelEdit}
      />

      {/* Monthly summary */}
      <WorkSummary
        summary={summary}
        data={data}
        records={records}
      />
    </div>
  );
}
