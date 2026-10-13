
import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
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
      <p
        className={`text-lg font-semibold tabular-nums ${valueClassName}`}
      >
        {value ?? "—"}
      </p>
    </div>
  );
}

function Breakdown({ title, rows = [] }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-text-muted">
        {title}
      </p>

      {rows.length === 0 ? (
        <p className="text-sm text-text-muted">—</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {rows.map((row) => (
            <li
              key={row.name}
              className="flex justify-between gap-4"
            >
              <span className="text-text">{row.name}</span>
              <span className="tabular-nums text-text-muted">
                {row.hours} h
              </span>
            </li>
          ))}
        </ul>
      )}
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

export default function WorkSummary({
  workerId,
  month,
  summary,
  data,
  records = [],
  refreshRef,
}) {
  const [payroll, setPayroll] = useState(null);
  const [payrollLoading, setPayrollLoading] = useState(true);
  const [payrollError, setPayrollError] = useState("");
  const [savingRate, setSavingRate] = useState(false);
  const [addingAdvance, setAddingAdvance] = useState(false);
  const [deletingAdvanceId, setDeletingAdvanceId] = useState("");

  const [hourlyRate, setHourlyRate] = useState("");
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [advanceDate, setAdvanceDate] = useState("");
  const [advanceNote, setAdvanceNote] = useState("");

  const loadPayroll = useCallback(
    async ({ force = false } = {}) => {
      if (!force) {
        const cached = getCachedPayroll(workerId, month);

        if (cached) {
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
        const url = `/workers/${workerId}/payroll?month=${month}${
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
    [workerId, month],
  );

  // Load payroll when the worker or month changes.
  useEffect(() => {
    loadPayroll();
  }, [loadPayroll]);

  // Expose payroll refresh to the parent WorkCalendar.
  useEffect(() => {
    if (!refreshRef) return;

    refreshRef.current = () => loadPayroll({ force: true });

    return () => {
      refreshRef.current = null;
    };
  }, [refreshRef, loadPayroll]);

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

  const totalHours = Number(summary?.totalHours ?? 0);
  const absentDays = Number(summary?.absentDays ?? 0);

  const rateIsSet = payroll?.hourlyRate != null;
  const rate = Number(payroll?.hourlyRate ?? 0);

  const grossPay = totalHours * rate;
  const absenceDeduction = Math.max(0, absentDays - 2) * 25;
  const netPay = grossPay - absenceDeduction;
  const totalAdvances = Number(payroll?.totalAdvances ?? 0);
  const remainingPay = netPay - totalAdvances;

  const hasWorkSummary = Boolean(summary);

  return (
    <div className="space-y-6 border-t border-border pt-4">
      {/* Work summary */}
      {hasWorkSummary && (
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-text">
            Work Summary
          </h3>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="Total hours" value={summary.totalHours} />
            <Stat label="Worked days" value={summary.workedDays} />
            <Stat label="Absent" value={summary.absentDays} />
            <Stat label="Holidays" value={summary.holidays} />
            <Stat label="Weekly offs" value={summary.weeklyOffs} />
          </div>

          <Breakdown title="Hours by role" rows={summary.byRole} />

          {data?.activeUpload?.originalFilename && (
            <p className="text-xs text-text-muted">
              Source: {data.activeUpload.originalFilename}
            </p>
          )}
        </section>
      )}

      {/* Payroll */}
      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-text">
            Payroll Summary
          </h3>
          <p className="mt-1 text-xs text-text-muted">
            Pay calculation for {month}. Hourly rate is saved
            separately for this worker and month.
          </p>
        </div>

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
                  step="0.01"
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
                value={
                  rateIsSet ? money(grossPay) : "Set hourly rate"
                }
              />

              <Stat
                label="Absence deduction"
                value={money(absenceDeduction)}
              />

              <Stat
                label="Net pay before advances"
                value={
                  rateIsSet ? money(netPay) : "Set hourly rate"
                }
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
                  Number(remainingPay.toFixed(2)) === 0
                    ? "text-green-600"
                    : "text-text"
                }
              />
            </div>

            <p className="text-xs text-text-muted">
              Absence deduction: AED 25 for each absence after
              the first two absences in the selected month.
            </p>

            {/* Advance payment history */}
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

              <form
                onSubmit={addAdvance}
                className="space-y-3 border-t border-border pt-3"
              >
                <p className="text-sm font-medium text-text">
                  Add an advance
                </p>

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

                <button
                  type="submit"
                  disabled={addingAdvance}
                  className="btn-primary inline-flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  {addingAdvance ? "Adding…" : "Add advance"}
                </button>
              </form>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
