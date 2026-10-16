import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Upload,
} from "lucide-react";

import Badge from "../ui/Badge.jsx";
import EmptyState from "../ui/EmptyState.jsx";
import { api } from "../../api/client.js";
import { useFetch } from "../../hooks.js";

import WorkCalendarGrid from "./WorkCalendarGrid.jsx";
import ConfirmWorkUpload from "./ConfirmWorkUpload.jsx";
import WorkMobileKeyboard from "./WorkMobileKeyboard.jsx";

import {
  getCachedWork,
  setCachedWork,
  invalidateCachedWork,
} from "../../utils/workCache.js";

import {
  getCachedRoles,
  setCachedRoles,
  invalidateCachedPayroll,
} from "../../utils/profileCache.js";

import {
  invalidateWorkerSummaries,
  invalidateMonthlyStats,
} from "../../utils/companyCache.js";

import {
  STATUS_FROM_KEY,
  monthKey,
  dateKey,
  parseDate,
  buildChanges,
  pad,
} from "./workCalendarUtils.js";


  function getRecordEntryValue(record) {
    if (!record || record.source !== "MANUAL") return "";

    if (record.status === "WORKED") {
      return String(record.hours ?? "");
    }

    return (
      Object.entries(STATUS_FROM_KEY).find(
        ([, status]) => status === record.status,
      )?.[0] ?? ""
    );
  }

export default function WorkCalendar({ workerId, companyId, onMonthChange, onWorkUpdated }) {
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
  const [drafts, setDrafts] = useState({});
  const [showUploadConfirm, setShowUploadConfirm] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [focusRoleAfterError, setFocusRoleAfterError] = useState(false);

  const roleSelectRef = useRef(null);
  const preserveRoleRef = useRef(false);

  const month = monthKey(ym.y, ym.m);

  useEffect(() => {
    onMonthChange?.(month);
  }, [month, onMonthChange]);

  function invalidateRelatedCaches(workDate) {
  const workMonth = workDate.slice(0, 7);

  invalidateCachedWork(workerId, workMonth);
  invalidateCachedPayroll(workerId,workMonth);
  invalidateMonthlyStats(companyId, workMonth);
  invalidateWorkerSummaries(companyId, workMonth, workerId);
}

  const { data, error, loading, reload } = useFetch(
    async () => {
      const cached = getCachedWork(workerId, month);

      if (cached) return cached;

      const response = await api.get(
        `/workers/${workerId}/work?month=${month}`
      );

      setCachedWork(workerId, month, response);
      return response;
    },
    [workerId, month],
  );

  const {
    data: rolesData,
    error: rolesError,
  } = useFetch(async () => {
    const cached = getCachedRoles();

    if (cached) return cached;

    const response = await api.get("/roles");
    setCachedRoles(response);

    return response;
  }, []);

  const roles = rolesData?.roles ?? [];
  const records = data?.records ?? [];

  const byDate = Object.fromEntries(
    records.map((record) => [
      String(record.date).slice(0, 10),
      record,
    ]),
  );

  const pendingByDate = drafts;
  const selectedDraft = selected ? drafts[selected] : null;
  const pendingRecords = Object.values(drafts);
  const pendingCount = pendingRecords.length;

  const selectedRecord = selected ? byDate[selected] : null;
  const isEditingManual = selectedRecord?.source === "MANUAL";
  const roleControlValue = selectedRecord
    ? isEditingManual
      ? editRoleId || selectedRecord.roleId || selectedRecord.role?.id || ""
      : selectedRecord.roleId || selectedRecord.role?.id || selectedRoleId
    : editRoleId || selectedDraft?.roleId || selectedRoleId;
  const roleControlDisabled =
    saving ||
    showUploadConfirm ||
    Boolean(selectedRecord && !isEditingManual);

  // Load the existing role when navigating to a manual record.
  // Non-WORKED records display an empty role selection.
  useEffect(() => {
  const current = selectedDraft ?? selectedRecord;

  if (!current) {
    if (preserveRoleRef.current) {
      preserveRoleRef.current = false;
      return;
    }

    setEditRoleId("");
    return;
  }

  if (current.source && current.source !== "MANUAL") {
    setEditRoleId("");
    return;
  }

  const roleId = current.roleId ?? current.role?.id ?? "";

  setEditRoleId(current.status === "WORKED" ? roleId : "");
  setSelectedRoleId(roleId);
}, [
  selected,
  selectedDraft?.status,
  selectedDraft?.roleId,
  selectedRecord?.id,
  selectedRecord?.source,
  selectedRecord?.status,
  selectedRecord?.roleId,
  selectedRecord?.role?.id,
]);
 
  function clearPendingEntry() {
    setEntryValue("");
    setSaveError("");
  }

  function confirmDiscardDrafts() {
    if (pendingCount === 0) return true;

    return window.confirm(
      `You have ${pendingCount} pending attendance record(s) for ${month}. ` +
      "Leaving this month will discard those drafts. " +
      "Upload them first, or confirm to discard them.",
    );
  }

  function changeMonthSafely(nextDate) {
    if (!confirmDiscardDrafts()) return;

    setDrafts({});
    setShowUploadConfirm(false);
    setSelected(dateKey(nextDate));
    setYm({
      y: nextDate.getFullYear(),
      m: nextDate.getMonth(),
    });
    clearPendingEntry();
  }

  useEffect(() => {
    if (pendingCount === 0) return;

    const warnBeforeLeaving = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", warnBeforeLeaving);

    return () => {
      window.removeEventListener("beforeunload", warnBeforeLeaving);
    };
  }, [pendingCount]);

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

      if (
        currentDate.getFullYear() !== ym.y ||
        currentDate.getMonth() !== ym.m
      ) {
        changeMonthSafely(currentDate);
        return;
      }

      setSelected(nextKey);
      clearPendingEntry();
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selected, today, ym.y, ym.m, pendingCount]);

  useEffect(() => {
    const current = selectedDraft
      ? { ...selectedDraft, source: "MANUAL" }
      : selectedRecord;

    setEntryValue(getRecordEntryValue(current));
    setSaveError("");
  }, [
    selected,
    selectedDraft?.status,
    selectedDraft?.hours,
    selectedDraft?.roleId,
    selectedRecord?.id,
    selectedRecord?.source,
    selectedRecord?.status,
    selectedRecord?.hours,
  ]);

  useEffect(() => {
    if (!focusRoleAfterError) return;

    const frame = requestAnimationFrame(() => {
      const roleSelect = roleSelectRef.current;

      if (roleSelect) {
        roleSelect.focus();
        roleSelect.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }

      setFocusRoleAfterError(false);
    });

    return () => cancelAnimationFrame(frame);
  }, [focusRoleAfterError]);

  function shiftMonth(delta) {
    const nextMonth = new Date(ym.y, ym.m + delta, 1);
    changeMonthSafely(nextMonth);
  }

function selectDate(date) {
    const key = typeof date === "string" ? date : dateKey(date);

    const targetDraft = drafts[key];
    const targetRecord = byDate[key];

    const roleToKeep =
      targetDraft?.roleId ||
      targetRecord?.roleId ||
      targetRecord?.role?.id ||
      selectedRoleId;

    setSelected(key);
    setEntryValue("");
    setSaveError("");
    setSelectedRoleId(roleToKeep || "");
    setEditRoleId(
      targetRecord?.source === "MANUAL"
        ? targetDraft?.roleId || targetRecord?.roleId || targetRecord?.role?.id || ""
        : ""
    );
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

  
function handleEntrySubmit(event) {
  event?.preventDefault();

  if (saving || showUploadConfirm) return;

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

  if (
    next.status === "WORKED" &&
    (!Number.isFinite(Number(next.hours)) ||
      Number(next.hours) <= 0 ||
      Number(next.hours) > 24)
  ) {
    setSaveError("Hours must be greater than 0 and at most 24.");
    return;
  }

  const existing = byDate[selected];

  if (existing && existing.source !== "MANUAL") {
    setSaveError("Timesheet records cannot be edited manually.");
    return;
  }

  let roleId = "";

  if (next.status === "WORKED") {
    roleId =
      editRoleId ||
      selectedDraft?.roleId ||
      existing?.role?.id ||
      selectedRoleId;

    if (!roleId) {
      setSaveError(
        "Select a role when entering worked hours.",
      );
      setFocusRoleAfterError(true);
      return;
    }

    const roleExists = roles.some((role) => role.id === roleId);

    if (!roleExists) {
      setSaveError("The selected role could not be found.");
      return;
    }
  } else {
    // Every new record needs a roleId in the database,
    // even when its status is Absent, Holiday, or Weekly off.
    roleId =
      selectedDraft?.roleId ||
      existing?.role?.id ||
      selectedRoleId;

    if (!existing && !roleId) {
      setSaveError("Select a role first.");
      setFocusRoleAfterError(true);
      return;
    }
  }

  const draft = {
    recordId: existing?.id,
    date: selected,
    workDate: selected,
    roleId,
    status: next.status,
    hours: next.status === "WORKED" ? next.hours : null,
  };

  // If this is an edit, compare the proposed value against the
  // original saved record, not the previous draft.
  if (existing) {
    const nextRole =
      roles.find((role) => role.id === roleId) ??
      existing.role;

    const changes = buildChanges(existing, next, nextRole);

    if (changes.length === 0) {
      if (drafts[selected]) {
        setDrafts((current) => {
          const updated = { ...current };
          delete updated[selected];
          return updated;
        });

        setEntryValue(getRecordEntryValue(existing));
        setSaveError("Draft removed because the record matches its saved value.");
      } else {
        setSaveError("No changes detected.");
      }

      return;
    }
  }

  setDrafts((current) => ({
    ...current,
    [selected]: draft,
  }));

  setSaveError("");
  return true;
}

  function handleSubmitAndAdvance(event) {
    // Remember the role used for this entry before changing dates.
    event?.preventDefault();

    const roleToKeep =
      editRoleId ||
      selectedDraft?.roleId ||
      selectedRecord?.roleId ||
      selectedRecord?.role?.id ||
      selectedRoleId;

    const staged = handleEntrySubmit();

    // Invalid entries must not advance.
    if (staged !== true) return;

    const currentDate = parseDate(selected);
    const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate();

    // Find the next editable date, skipping read-only timesheet records.
    let nextDay = currentDate.getDate() + 1;

    while (nextDay <= daysInMonth) {
      const nextDate = new Date(ym.y, ym.m, nextDay);
      const nextKey = dateKey(nextDate);
      const nextRecord = byDate[nextKey];

      if (!nextRecord || nextRecord.source === "MANUAL") {
        preserveRoleRef.current = true;

        setSelectedRoleId(roleToKeep);
        setEditRoleId("");
        setSelected(nextKey);
        setEntryValue("");
        setSaveError("");

        return;
      }

      nextDay += 1;
    }

    setShowUploadConfirm(true);
  }

async function confirmUpload() {
  if (saving || pendingCount === 0) return;

  setSaving(true);
  setSaveError("");

  try {
    const recordsToUpload = pendingRecords.map((draft) => ({
      ...(draft.recordId ? { recordId: draft.recordId } : {}),
      workDate: draft.workDate,
      roleId: draft.roleId,
      status: draft.status,
      ...(draft.status === "WORKED"
        ? { hours: Number(draft.hours) }
        : {}),
    }));

    await api.post(`/workers/${workerId}/work/batch`, {
      records: recordsToUpload,
    });

    invalidateRelatedCaches(`${month}-01`);

    setDrafts({});
    setShowUploadConfirm(false);
    setEntryValue("");
    setSaveError("");

    await reload();
    onWorkUpdated?.();
  } catch (err) {
    // Keep drafts if the batch fails so the user can retry.
    setSaveError(
      err?.message || "Could not upload attendance records.",
    );
    setShowUploadConfirm(false);
  } finally {
    setSaving(false);
  }
}

  const title = new Date(ym.y, ym.m, 1).toLocaleDateString(
    "en-GB",
    {
      month: "long",
      year: "numeric",
    },
  );

  async function handleRefresh() {
      if (refreshing) return;

      setRefreshing(true);

      invalidateRelatedCaches(`${month}-01`);

      try {
        await reload();
        onWorkUpdated?.();
      } finally {
        setRefreshing(false);
      }
    }

  return (
    <div className="space-y-5">
      {/* Month navigation and status legend */}
      <div className="flex flex-wrap items-center justify-between gap-3">
  {/* Upload records */}
  <button
    type="button"
    className="inline-flex items-center gap-2 rounded-md border border-[#007AFF] bg-[#007AFF] px-3 py-2 text-white hover:opacity-90 dark:border-[#0A84FF] dark:bg-[#0A84FF]"
    onClick={() => {
      if (pendingCount > 0) {
        setShowUploadConfirm(true);
        setSaveError("");
      }
    }}
    disabled={saving || pendingCount === 0}
    title="Review and upload pending attendance records"
  >
    <Upload className="h-4 w-4" />
    Upload records
    {pendingCount > 0 && (
      <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-xs">
        {pendingCount}
      </span>
    )}
  </button>
    {/* Month navigation + Refresh — grouped towards the right */}
  <div className="flex flex-wrap items-center gap-2">
       <button
      type="button"
      className="btn-secondary inline-flex items-center gap-2"
      onClick={handleRefresh}
      disabled={refreshing}
      title="Refresh work records and payroll"
    >
      <RefreshCw
        className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
      />
      {refreshing ? "Refreshing…" : "Refresh"}
    </button>
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
  {/* Role selector — moved before month navigation */}
  <label className="flex items-center gap-2 text-sm text-text-muted">
    <span className="sr-only">Role for selected date</span>
    <select
      ref={roleSelectRef}
      aria-label="Role for selected date"
      className="input min-w-0 max-w-52"
      value={roleControlValue}
      onChange={(event) => {
        const value = event.target.value;

        if (selectedRecord || selectedDraft) {
          setEditRoleId(value);
        } else {
          setSelectedRoleId(value);
        }

        setSaveError("");
      }}
      disabled={roleControlDisabled}
    >
      <option value="">Select role</option>
      {roles.map((role) => (
        <option key={role.id} value={role.id}>
          {role.code} — {role.name}
        </option>
      ))}
    </select>
  </label>

  {/* Status legend */}
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
        pendingByDate={pendingByDate}
        entryValue={entryValue}
        onEntryValueChange={(value) => {
          setEntryValue(value);
          setSaveError("");
        }}
        canEditSelected={!selectedRecord || isEditingManual}
        entryDisabled={saving || showUploadConfirm}
        onSelectDate={selectDate}
        onSubmit={handleEntrySubmit}
        onSubmitAndAdvance={handleSubmitAndAdvance}
      />

            {saveError && (
        <p role="alert" className="text-sm text-danger">
          {saveError}
        </p>
      )}


      <WorkMobileKeyboard
        value={entryValue}
        onChange={(value) => {
          setEntryValue(value);
          setSaveError("");
        }}
        onSubmit={handleSubmitAndAdvance}
        disabled={
          saving ||
          showUploadConfirm ||
          !selected ||
          !(!selectedRecord || isEditingManual)
        }
      />

      {!loading && records.length === 0 && (
        <EmptyState
          title="No work records this month"
          description="Select a date, choose a role from the calendar toolbar, and enter hours or a status in the calendar."
        />
      )}

      {showUploadConfirm && (
        <ConfirmWorkUpload
          month={month}
          records={pendingRecords}
          saving={saving}
          onConfirm={confirmUpload}
          onCancel={() => {
            if (!saving) setShowUploadConfirm(false);
          }}
        />
      )}

    </div>
  );
}
