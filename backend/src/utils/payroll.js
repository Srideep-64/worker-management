
export function money(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function calculatePayroll({
  totalHours = 0,
  absentDays = 0,
  hourlyRate = null,
  totalAdvances = 0,
}) {
  const hours = Number(totalHours ?? 0);
  const absences = Number(absentDays ?? 0);
  const rate =
    hourlyRate == null ? null : Number(hourlyRate);
  const advances = money(Number(totalAdvances ?? 0));

  const grossPay =
    rate === null ? null : money(hours * rate);

  const absenceDeduction =
    rate === null
      ? null
      : money(Math.max(0, absences - 2) * 25);

  const netPay =
    grossPay === null
      ? null
      : money(grossPay - absenceDeduction);

  const remainingPay =
    netPay === null
      ? null
      : money(netPay - advances);

  return {
    grossPay,
    absenceDeduction,
    netPay,
    totalAdvances: advances,
    remainingPay,
  };
}
