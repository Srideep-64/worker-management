
import {
  currentUaeMonthString,
  monthRange,
  dateOnly,
} from "./dates.js";

export function getWorkerStatusForMonth(worker, month) {
  const { start, end } = monthRange(month);

  const selectedMonthStart = dateOnly(start);
  const nextMonthStart = dateOnly(end);

  const joiningDate = dateOnly(worker.joiningDate);
  const leavingDate = dateOnly(worker.leavingDate);

  if (joiningDate && joiningDate >= nextMonthStart) {
    return "INACTIVE";
  }

  if (leavingDate && leavingDate < selectedMonthStart) {
    return "INACTIVE";
  }

  return "ACTIVE";
}

export function getWorkerStatus(worker) {
  return getWorkerStatusForMonth(worker, currentUaeMonthString());
}
