
import {
  CELL_TONE,
  SHORT,
  WEEKDAYS,
  pad,
} from "./workCalendarUtils.js";

export default function WorkCalendarGrid({
  year,
  month,
  selected,
  byDate,
  onSelectDate,
}) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Convert Sunday-first JS indexing into a Monday-first calendar.
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;

  const currentMonth = `${year}-${pad(month + 1)}`;

  return (
    <div className="grid grid-cols-7 gap-1.5">
      {WEEKDAYS.map((day, index) => {
        const isSunday = index === 6;

        return (
          <div
            key={day}
            className={`pb-1 text-center text-xs font-bold ${
              isSunday ? "text-red-700" : "text-text-muted"
            }`}
          >
            {day}
          </div>
        );
      })}

      {Array.from({ length: offset }, (_, index) => (
        <div key={`offset-${index}`} />
      ))}

      {Array.from({ length: daysInMonth }, (_, index) => {
        const day = index + 1;
        const key = `${currentMonth}-${pad(day)}`;
        const record = byDate[key];

        // Sunday is the seventh column in the Monday-first grid.
        const isSunday = (offset + index) % 7 === 6;

        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelectDate(key)}
            aria-pressed={selected === key}
            aria-label={`${key}${record ? `, ${record.status}` : ""}`}
            className={`flex h-14 flex-col items-start justify-between rounded-md p-1.5 text-left text-xs transition-colors ${
              record
                ? CELL_TONE[record.status] ||
                  "border border-border text-text"
                : "border border-dashed border-border text-text-muted"
            } ${
              isSunday ? "border-2 border-red-400" : ""
            } ${
              selected === key ? "ring-2 ring-accent" : ""
            }`}
          >
            <span
              className={`font-semibold ${
                isSunday ? "text-red-700" : ""
              }`}
            >
              {day}
            </span>

            <span className="self-end text-sm font-semibold tabular-nums">
              {record
                ? record.status === "WORKED"
                  ? record.hours ?? "—"
                  : SHORT[record.status] ?? "—"
                : ""}
            </span>
          </button>
        );
      })}
    </div>
  );
}
