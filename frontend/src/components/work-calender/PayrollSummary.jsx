
import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { api } from "../../api/client.js";
import {
  getCachedPayroll,
  setCachedPayroll,
  invalidateCachedPayroll,
} from "../../utils/profileCache.js";

function Stat({ label, value, valueClassName = "text-text" }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <p className="text-xs uppercase tracking-wide text-text-muted">
        {label}
      </p>
      <p className={`text-lg font-semibold tabular-nums ${valueClassName}`}>
        {value ?? "—"}
      </p>
    </div>
  );
}

function money(value) {
  return `AED ${Number(value || 0).toFixed(2)}`;
}

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
}

export default function PayrollSummary({
  workerId,
  month,
  summary,
  refreshRef,
}) {
  // Collapsed by default. Do not fetch payroll until opened.
  const [expanded, setExpanded] = useState(false);

  const [payroll, setPayroll] = useState(null);
  const [payrollLoading, setPayrollLoading] = useState(false);
  const [payrollError, setPayrollError] = useState("");

  const [savingRate, setSavingRate] = useState(false);
  const [addingAdvance, setAddingAdvance] = useState(false);
  const [showAddAdvanceModal, setShowAddAdvanceModal] = useState(false);
  const [showClearRemainingConfirm, setShowClearRemainingConfirm] =
    useState(false);
  const [clearingRemaining, setClearingRemaining] = useState(false);
  const [deletingAdvanceId, setDeletingAdvanceId] = useState("");

  const [hourlyRate, setHourlyRate] = useState("");
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [advanceDate, setAdvanceDate] = useState("");
  const [advanceNote, setAdvanceNote] = useState("");

  const loadPayroll = useCallback(
    async ({ force = false } = {}) => {
      // Never load payroll while the panel is collapsed.
      if (!expanded) return;

      if (!force) {
        const cached = getCachedPayroll(workerId, month);

        const hasRequiredFields =
          cached &&
          "totalHours" in cached &&
          "absentDays" in cached &&
          "grossPay" in cached &&
          "absenceDeduction" in cached &&
          "netPay" in cached &&
          "remainingPay" in cached;

        if (hasRequiredFields) {
          setPayroll(cached);
          setHourlyRate(
            cached.hourlyRate == null
              ? ""
              : String(cached.hourlyRate),
          );
          setPayrollError("");
          setPayrollLoading(false);
          return;
        }
      }

      setPayrollLoading(true);
      setPayrollError("");

      try {
        const url = `/workers/${workerId}/payroll?month=${encodeURIComponent(
          month,
        )}${
          force ? `&_refresh=${Date.now()}` : ""
        }`;

        const result = await api.get(url);

        setCachedPayroll(workerId, month, result);
        setPayroll(result);
        setHourlyRate(
          result.hourlyRate == null
            ? ""
            : String(result.hourlyRate),
        );
      } catch (err) {
        setPayrollError(
          err?.message || "Could not load payroll information.",
        );
      } finally {
        setPayrollLoading(false);
      }
    },
    [workerId, month, expanded],
  );

  // Fetch only when opened. Reopening can use the cached result.
  useEffect(() => {
    if (expanded) {
      loadPayroll();
    }
  }, [expanded, loadPayroll]);

  // Allow the parent to request a payroll refresh.
  // If collapsed, defer the request until the user opens the panel.
  useEffect(() => {
    if (!refreshRef) return;

    refreshRef.current = () => {
      if (expanded) {
        return loadPayroll({ force: true });
      }
    };

    return () => {
      refreshRef.current = null;
    };
  }, [refreshRef, expanded, loadPayroll]);

  async function saveHourlyRate(event) {
    event.preventDefault();

    const rate = Number(hourlyRate);

    if (
      hourlyRate.trim() === "" ||
      !Number.isFinite(rate) ||
      rate < 0 ||
      rate > 100000
    ) {
      setPayrollError("Enter a valid hourly rate.");
      return;
    }

    setSavingRate(true);
    setPayrollError("");

    try {
      await api.patch(`/workers/${workerId}/payroll/rate`, {
        month,
        hourlyRate: rate,
      });

      invalidateCachedPayroll(workerId, month);
      await loadPayroll({ force: true });
    } catch (err) {
      setPayrollError(
        err?.message || "Could not save the hourly rate.",
      );
    } finally {
      setSavingRate(false);
    }
  }

  async function addAdvance(event) {
    event.preventDefault();

    const amount = Number(advanceAmount);

    if (
      advanceAmount.trim() === "" ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      amount > 10000000
    ) {
      setPayrollError("Enter a valid advance amount.");
      return;
    }

    setAddingAdvance(true);
    setPayrollError("");

    try {
      await api.post(`/workers/${workerId}/advances`, {
        payrollMonth: month,
        amount,
        ...(advanceDate
          ? {
              paidAt: new Date(
                `${advanceDate}T12:00:00`,
              ).toISOString(),
            }
          : {}),
        ...(advanceNote.trim()
          ? { note: advanceNote.trim() }
          : {}),
      });

      setAdvanceAmount("");
      setAdvanceDate("");
      setAdvanceNote("");
      setShowAddAdvanceModal(false);

      invalidateCachedPayroll(workerId, month);
      await loadPayroll({ force: true });
    } catch (err) {
      setPayrollError(
        err?.message || "Could not add the advance payment.",
      );
    } finally {
      setAddingAdvance(false);
    }
  }

  async function clearRemainingPay() {
    const amount =
      Math.round(
        (Number(remainingPay) + Number.EPSILON) * 100,
      ) / 100;

    if (!Number.isFinite(amount) || amount <= 0) {
      setPayrollError("There is no remaining pay to clear.");
      setShowClearRemainingConfirm(false);
      return;
    }

    setClearingRemaining(true);
    setPayrollError("");

    try {
      await api.post(`/workers/${workerId}/advances`, {
        payrollMonth: month,
        amount,
        note: "Remaining pay cleared",
      });

      setShowClearRemainingConfirm(false);
      invalidateCachedPayroll(workerId, month);
      await loadPayroll({ force: true });
    } catch (err) {
      setPayrollError(
        err?.message || "Could not clear the remaining pay.",
      );
    } finally {
      setClearingRemaining(false);
    }
  }

  async function deleteAdvance(advanceId) {
    if (!window.confirm("Delete this advance payment?")) return;

    setDeletingAdvanceId(advanceId);
    setPayrollError("");

    try {
      await api.delete(
        `/workers/${workerId}/advances/${advanceId}`,
      );

      invalidateCachedPayroll(workerId, month);
      await loadPayroll({ force: true });
    } catch (err) {
      setPayrollError(
        err?.message || "Could not delete the advance payment.",
      );
    } finally {
      setDeletingAdvanceId("");
    }
  }

  const totalHours = Number(
    payroll?.totalHours ?? summary?.totalHours ?? 0,
  );

  const absentDays = Number(
    payroll?.absentDays ?? summary?.absentDays ?? 0,
  );

  const rateIsSet = payroll?.hourlyRate != null;
  const grossPay = payroll?.grossPay ?? null;
  const absenceDeduction = payroll?.absenceDeduction ?? null;
  const netPay = payroll?.netPay ?? null;
  const totalAdvances = Number(payroll?.totalAdvances ?? 0);
  const remainingPay = payroll?.remainingPay ?? null;

  return (
    <section className="rounded-lg bg-surface border border-border p-4">
      {/* Collapsible header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-text">
            Payroll Summary
          </h3>
          <p className="mt-1 text-xs text-text-muted">
            Payroll calculation and advance payment history for {month}.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setPayrollError("");
            setExpanded((value) => !value);
          }}
          aria-expanded={expanded}
          className="btn-secondary inline-flex shrink-0 items-center gap-2"
        >
          {expanded ? "Hide payroll" : "Show payroll"}
          {expanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Payroll and advances are loaded/rendered only when expanded */}
      {expanded && (
        <div className="mt-4 space-y-4">
          {payrollError && (
            <p role="alert" className="text-sm text-danger">
              {payrollError}
            </p>
          )}

          {payrollLoading ? (
            <p className="text-sm text-text-muted">
              Loading payroll information…
            </p>
          ) : (
            <>
              <form
                onSubmit={saveHourlyRate}
                className="flex flex-wrap items-end gap-3"
              >
                <label className="block w-full max-w-xs">
                  <span className="mb-1 block text-sm text-text">
                    Pay per hour (AED)
                  </span>
                  <input
                    type="number"
                    min="0"
                    max="100000"
                    step="0.25"
                    value={hourlyRate}
                    onChange={(event) =>
                      setHourlyRate(event.target.value)
                    }
                    className="input w-full"
                    placeholder="Enter hourly rate"
                    required
                  />
                </label>

                <button
                  type="submit"
                  disabled={savingRate}
                  className="btn-primary"
                >
                  {savingRate ? "Saving…" : "Save rate"}
                </button>
              </form>

              {!rateIsSet && (
                <p className="text-sm text-text-muted">
                  Enter and save an hourly rate to calculate this
                  worker&apos;s pay.
                </p>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Stat
                  label="Total hours"
                  value={`${totalHours.toFixed(2)} h`}
                />

                <Stat
                  label="Estimated gross pay"
                  value={rateIsSet ? money(grossPay) : "Set hourly rate"}
                />

                <Stat
                  label="Absence deduction"
                  value={money(absenceDeduction)}
                />

                <Stat
                  label="Net pay before advances"
                  value={rateIsSet ? money(netPay) : "Set hourly rate"}
                />

                <Stat
                  label="Total advances paid"
                  value={money(totalAdvances)}
                />

                <Stat
                  label="Remaining pay"
                  value={
                    rateIsSet ? money(remainingPay) : "Set hourly rate"
                  }
                  valueClassName={
                    rateIsSet &&
                    remainingPay != null &&
                    Number(remainingPay) <= 0
                      ? "text-green-600"
                      : "text-text"
                  }
                />
              </div>

              <p className="text-xs text-text-muted">
                Absence deduction: AED 25 for each absence after
                the first two absences in the selected month.
              </p>

              {/* Advance payments share the payroll container */}
              <div className="space-y-3 rounded-lg border border-border p-4">
                <div>
                  <h4 className="text-sm font-semibold text-text">
                    Advance Payments
                  </h4>
                  <p className="mt-1 text-xs text-text-muted">
                    Each entry is recorded separately for {month}.
                  </p>
                </div>

                {payroll?.advances?.length > 0 ? (
                  <div className="space-y-2">
                    {payroll.advances.map((advance) => (
                      <div
                        key={advance.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-text">
                            {money(advance.amount)}
                          </p>
                          <p className="text-xs text-text-muted">
                            {formatDate(advance.paidAt)}
                            {advance.note ? ` · ${advance.note}` : ""}
                          </p>
                          <p className="text-xs text-text-muted">
                            Recorded by:{" "}
                            {advance.createdByName || "Unknown user"}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => deleteAdvance(advance.id)}
                          disabled={deletingAdvanceId === advance.id}
                          className="btn-secondary"
                          aria-label="Delete advance payment"
                          title="Delete advance payment"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-text-muted">
                    No advance payments recorded for this month.
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                  <button
                    type="button"
                    onClick={() => setShowClearRemainingConfirm(true)}
                    disabled={
                      addingAdvance ||
                      clearingRemaining ||
                      savingRate ||
                      !rateIsSet ||
                      remainingPay == null ||
                      Number(remainingPay) <= 0
                    }
                    className="btn-secondary"
                  >
                    Clear remaining pay
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPayrollError("");
                      setShowAddAdvanceModal(true);
                    }}
                    disabled={addingAdvance || clearingRemaining}
                    className="btn-primary inline-flex items-center gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Add advance
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Add advance modal */}
      {showAddAdvanceModal && expanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !addingAdvance
            ) {
              setShowAddAdvanceModal(false);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-advance-title"
            className="w-full max-w-lg space-y-4 rounded-lg border border-border bg-surface p-5 shadow-xl"
          >
            <div>
              <h3
                id="add-advance-title"
                className="text-lg font-semibold text-text"
              >
                Add an advance
              </h3>
              <p className="mt-1 text-sm text-text-muted">
                Record an advance payment for {month}.
              </p>
            </div>

            <form onSubmit={addAdvance} className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm text-text">
                    Amount (AED)
                  </span>
                  <input
                    type="number"
                    min="0.01"
                    max="10000000"
                    step="0.01"
                    value={advanceAmount}
                    onChange={(event) =>
                      setAdvanceAmount(event.target.value)
                    }
                    className="input w-full"
                    placeholder="e.g. 500"
                    required
                    autoFocus
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm text-text">
                    Payment date
                  </span>
                  <input
                    type="date"
                    value={advanceDate}
                    onChange={(event) =>
                      setAdvanceDate(event.target.value)
                    }
                    className="input w-full"
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-1 block text-sm text-text">
                  Note (optional)
                </span>
                <input
                  type="text"
                  maxLength={500}
                  value={advanceNote}
                  onChange={(event) =>
                    setAdvanceNote(event.target.value)
                  }
                  className="input w-full"
                  placeholder="e.g. Cash advance"
                />
              </label>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={addingAdvance}
                  onClick={() => setShowAddAdvanceModal(false)}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={addingAdvance || clearingRemaining}
                  className="btn-primary inline-flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  {addingAdvance ? "Adding…" : "Add advance"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* Clear remaining pay confirmation modal */}
      {showClearRemainingConfirm && expanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !clearingRemaining
            ) {
              setShowClearRemainingConfirm(false);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-remaining-title"
            className="w-full max-w-md space-y-4 rounded-lg border border-border bg-surface p-5 shadow-xl"
          >
            <div>
              <h3
                id="clear-remaining-title"
                className="text-lg font-semibold text-text"
              >
                Clear remaining pay?
              </h3>
              <p className="mt-2 text-sm text-text-muted">
                This will add{" "}
                <strong className="text-text">
                  {money(remainingPay)}
                </strong>{" "}
                to the advance payments for {month}. The remaining
                pay will become AED 0.00.
              </p>
              <p className="mt-2 text-xs text-text-muted">
                The amount will be saved in the advance payment history
                with the note{" "}
                <strong>“Remaining pay cleared”</strong>.
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn-secondary"
                disabled={clearingRemaining}
                onClick={() => setShowClearRemainingConfirm(false)}
              >
                Cancel
              </button>

              <button
                type="button"
                className="btn-primary"
                disabled={clearingRemaining}
                onClick={clearRemainingPay}
              >
                {clearingRemaining
                  ? "Clearing…"
                  : "Confirm and clear"}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
