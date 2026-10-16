
import Modal from "../ui/Modal.jsx";

export default function ConfirmWorkUpload({
  month,
  records = [],
  saving = false,
  onConfirm,
  onCancel,
}) {
  const totals = records.reduce(
    (result, record) => {
      result.total += 1;

      if (record.status === "WORKED") {
        result.worked += 1;
        result.hours += Number(record.hours || 0);
      } else if (record.status === "ABSENT") {
        result.absent += 1;
      } else if (record.status === "HOLIDAY") {
        result.holidays += 1;
      } else if (record.status === "WEEKLY_OFF") {
        result.weeklyOff += 1;
      }

      return result;
    },
    {
      total: 0,
      worked: 0,
      absent: 0,
      holidays: 0,
      weeklyOff: 0,
      hours: 0,
    },
  );

  const monthLabel = (() => {
    const [year, monthNumber] = month.split("-");
    return new Date(
      Number(year),
      Number(monthNumber) - 1,
      1,
    ).toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    });
  })();

  return (
    <Modal
      title="Confirm attendance upload"
      onClose={onCancel}
    >
      <div className="space-y-4">
        <p className="text-sm text-text-muted">
          Review the pending records for {monthLabel}.
          No changes have been saved yet.
        </p>

        <div className="rounded-lg border border-border p-4">
          <p className="text-sm text-text-muted">
            Attendance records in this batch
          </p>
          <p className="mt-1 text-2xl font-bold text-text">
            {totals.total}
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-text-muted">Worked days</p>
              <p className="font-semibold">{totals.worked}</p>
            </div>
            <div>
              <p className="text-text-muted">Total hours</p>
              <p className="font-semibold">
                {Number(totals.hours.toFixed(2))}
              </p>
            </div>
            <div>
              <p className="text-text-muted">Absences</p>
              <p className="font-semibold">{totals.absent}</p>
            </div>
            <div>
              <p className="text-text-muted">Holidays</p>
              <p className="font-semibold">{totals.holidays}</p>
            </div>
            <div>
              <p className="text-text-muted">Weekly offs</p>
              <p className="font-semibold">{totals.weeklyOff}</p>
            </div>
          </div>
        </div>

        <p className="text-sm text-text-muted">
          New records and changes to existing manual records
          will be submitted together.
        </p>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={onConfirm}
            disabled={saving || totals.total === 0}
          >
            {saving ? "Uploading…" : "Confirm upload"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
