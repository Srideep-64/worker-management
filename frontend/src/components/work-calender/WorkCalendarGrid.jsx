import { useEffect, useRef,useState } from "react";

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
  entryValue,
  onEntryValueChange,
  canEditSelected,
  entryDisabled,
  onSelectDate,
  onSubmit,
}) {
  const cellInputRef = useRef(null);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const currentMonth = `${year}-${pad(month + 1)}`;

  useEffect(() => {
    if (!canEditSelected || entryDisabled) return;

    cellInputRef.current?.focus({ preventScroll: true });
  }, [selected, canEditSelected, entryDisabled]);

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");

    const updateMobile = () => setIsMobile(media.matches);

    updateMobile();
    media.addEventListener("change", updateMobile);

    return () => media.removeEventListener("change", updateMobile);
  }, []);

  return (
    <div className="grid grid-cols-7 gap-1.5">
      {WEEKDAYS.map((day, index) => (
        <div
          key={day}
          className={`pb-1 text-center text-xs font-bold ${
            index === 6 ? "text-red-700" : "text-text-muted"
          }`}
        >
          {day}
        </div>
      ))}

      {Array.from({ length: offset }, (_, index) => (
        <div key={`offset-${index}`} />
      ))}

      {Array.from({ length: daysInMonth }, (_, index) => {
        const day = index + 1;
        const key = `${currentMonth}-${pad(day)}`;
        const record = byDate[key];
        const isSelected = selected === key;
        const isSunday = (offset + index) % 7 === 6;
        const editable = isSelected && canEditSelected;

        const displayValue = record
          ? record.status === "WORKED"
            ? record.hours ?? "—"
            : SHORT[record.status] ?? "—"
          : "";

        return (
          <div
            key={key}
            role="button"
            tabIndex={0}
            onClick={() => onSelectDate(key)}
            onKeyDown={(event) => {
              if (
                event.target === event.currentTarget &&
                (event.key === "Enter" || event.key === " ")
              ) {
                event.preventDefault();
                onSelectDate(key);
              }
            }}
            aria-pressed={isSelected}
            aria-label={`Select ${key}`}
            className={`flex h-14 min-w-0 cursor-pointer flex-col items-stretch justify-between overflow-hidden rounded-md border p-1.5 text-xs transition-colors ${
              record
                ? CELL_TONE[record.status] ||
                  "border-border text-text"
                : "border-dashed border-border text-text-muted"
            } ${
              isSunday ? "border-2 border-red-400" : ""
            } ${
              isSelected ? "ring-2 ring-accent" : ""
            }`}
          >
            <span
              className={`w-fit font-semibold ${
                isSunday ? "text-red-700" : ""
              }`}
            >
              {day}
            </span>

            {editable ? (
              <input  
              ref={cellInputRef}
              type="text"
              inputMode={isMobile ? "none" : "decimal"}
              readOnly={isMobile}
              autoComplete="off"
              aria-label={`${key} hours or status`}
              placeholder="Hours/A/H/W"
              value={entryValue}
              disabled={entryDisabled}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => onEntryValueChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.stopPropagation();
                  onSubmit();
                }
              }}
              className="w-full min-w-0 bg-transparent text-right text-sm font-semibold text-accent-dark outline-none placeholder:text-[9px] placeholder:text-text-muted"
            />
            ) : (
              <span className="w-full truncate text-right text-sm font-semibold tabular-nums">
                {displayValue || "\u00a0"}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
