
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { calculatePayroll, money } from "../utils/payroll.js";

const querySchema = z.object({
  type: z.literal("work"),
  period: z.enum(["one-year", "selected-year"]),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  includePayroll: z.enum(["true", "false"]).optional(),
}).superRefine((value, context) => {
  if (value.period === "selected-year" && value.year == null) {
    context.addIssue({
      code: "custom",
      path: ["year"],
      message: "Year is required",
    });
  }
});

const COLORS = {
  navy: rgb(0.04, 0.14, 0.32),
  ink: rgb(0.15, 0.20, 0.28),
  muted: rgb(0.40, 0.46, 0.54),
  border: rgb(0.81, 0.85, 0.90),
  pale: rgb(0.94, 0.96, 0.99),
  white: rgb(1, 1, 1),
};

const monthStart = (year, zeroBasedMonth) =>
  new Date(Date.UTC(year, zeroBasedMonth, 1));

const monthKey = (date) =>
  date.toISOString().slice(0, 7);

const dateText = (date) =>
  date ? date.toISOString().slice(0, 10) : "-";

const num = (value) => Number(value ?? 0);

const fmt = (value, decimals = 2) =>
  value == null
    ? "-"
    : num(value).toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });

function labelMonth(key, short = false) {
  const [year, month] = key.split("-").map(Number);

  return new Intl.DateTimeFormat("en-GB", {
    month: short ? "short" : "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(monthStart(year, month - 1));
}

function currentDubaiMonth() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());

  const get = (type) =>
    Number(parts.find((part) => part.type === type).value);

  return {
    year: get("year"),
    month: get("month"),
  };
}

function reportRange(period, year) {
  if (period === "selected-year") {
    return {
      start: monthStart(year, 0),
      end: monthStart(year + 1, 0),
    };
  }

  const today = currentDubaiMonth();

  // Current month plus previous 11 months.
  return {
    start: monthStart(today.year, today.month - 13),
    end: monthStart(today.year, today.month - 1),
  };
}

function safeText(value) {
  return String(value ?? "-")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
}

export const downloadWorkerWorkPdf = asyncHandler(
  async (req, res) => {
    const {
      period,
      year,
      includePayroll: requestedPayroll,
    } = querySchema.parse(req.query);

    const includePayroll = requestedPayroll === "true";

    const { start, end } = reportRange(period, year);
    const workerId = req.params.id;

    const [worker, workRecords, payrollRows, advances] =
      await Promise.all([
        prisma.worker.findUnique({
          where: { id: workerId },
          select: {
            workerCode: true,
            name: true,
            nationality: true,
            jobTitle: true,
            joiningDate: true,
            leavingDate: true,
            company: {
              select: {
                name: true,
                code: true,
              },
            },
          },
        }),

        prisma.workRecord.findMany({
          where: {
            workerId,
            workDate: {
              gte: start,
              lt: end,
            },
          },
          select: {
            workDate: true,
            hours: true,
            status: true,
          },
        }),

        includePayroll
          ? prisma.workerPayroll.findMany({
              where: {
                workerId,
                payrollMonth: {
                  gte: start,
                  lt: end,
                },
              },
              select: {
                payrollMonth: true,
                hourlyRate: true,
              },
            })
          : Promise.resolve([]),

        includePayroll
          ? prisma.advancePayment.findMany({
              where: {
                workerId,
                payrollMonth: {
                  gte: start,
                  lt: end,
                },
              },
              select: {
                payrollMonth: true,
                amount: true,
              },
            })
          : Promise.resolve([]),
      ]);

    if (!worker) {
      throw ApiError.notFound("Worker not found");
    }

    // Build monthly summaries.
    // hasRecords distinguishes missing data from real zeros.
    const byMonth = new Map();

    for (
      let cursor = new Date(start);
      cursor < end;
      cursor = monthStart(
        cursor.getUTCFullYear(),
        cursor.getUTCMonth() + 1
      )
    ) {
      const key = monthKey(cursor);

      byMonth.set(key, {
        key,
        hours: 0,
        worked: 0,
        absent: 0,
        off: 0,
        holiday: 0,
        hasRecords: false,
        rate: null,
        advances: 0,
      });
    }

    for (const record of workRecords) {
      const month = byMonth.get(
        monthKey(record.workDate)
      );

      if (!month) continue;

      month.hasRecords = true;

      switch (record.status) {
        case "WORKED":
          month.worked++;
          month.hours += num(record.hours);
          break;

        case "ABSENT":
          month.absent++;
          break;

        case "WEEKLY_OFF":
          month.off++;
          break;

        case "HOLIDAY":
          month.holiday++;
          break;

        default:
          break;
      }
    }

    for (const row of payrollRows) {
      const month = byMonth.get(
        monthKey(row.payrollMonth)
      );

      if (month) {
        month.rate = num(row.hourlyRate);
      }
    }

    for (const advance of advances) {
      const month = byMonth.get(
        monthKey(advance.payrollMonth)
      );

      if (month) {
        month.advances = money(
          month.advances + num(advance.amount)
        );
      }
    }

    const months = [...byMonth.values()].map((month) => ({
      ...month,
      payroll: includePayroll
        ? calculatePayroll({
            totalHours: month.hours,
            absentDays: month.absent,
            hourlyRate: month.rate,
            totalAdvances: month.advances,
          })
        : null,
    }));

    const totals = {
      hours: 0,
      worked: 0,
      absent: 0,
      off: 0,
      holiday: 0,
      gross: 0,
      deduction: 0,
      advances: 0,
      net: 0,
      balance: 0,
      ratedMonths: 0,
    };

    for (const month of months) {
      totals.hours += month.hours;
      totals.worked += month.worked;
      totals.absent += month.absent;
      totals.off += month.off;
      totals.holiday += month.holiday;

      if (includePayroll) {
        totals.advances = money(
          totals.advances +
          month.payroll.totalAdvances
        );

        if (month.rate !== null) {
          totals.ratedMonths++;

          totals.gross = money(
            totals.gross + month.payroll.grossPay
          );

          totals.deduction = money(
            totals.deduction +
            month.payroll.absenceDeduction
          );

          totals.net = money(
            totals.net + month.payroll.netPay
          );

          totals.balance = money(
            totals.balance +
            month.payroll.remainingPay
          );
        }
      }
    }

    const payTotal = (value) =>
      totals.ratedMonths ? fmt(value) : "-";

    // Landscape with payroll, portrait without.
    const pdf = await PDFDocument.create();

    const regular = await pdf.embedFont(
      StandardFonts.Helvetica
    );

    const bold = await pdf.embedFont(
      StandardFonts.HelveticaBold
    );

    const [W, H] = includePayroll
      ? [841.89, 595.28]
      : [595.28, 841.89];

    const page = pdf.addPage([W, H]);

    function fit(value, width, size, font) {
      const original = safeText(value);

      if (
        font.widthOfTextAtSize(original, size) <= width
      ) {
        return original;
      }

      let result = original;

      while (
        result &&
        font.widthOfTextAtSize(
          `${result}...`,
          size
        ) > width
      ) {
        result = result.slice(0, -1);
      }

      return result ? `${result}...` : "";
    }

    function text(value, x, y, opts = {}) {
      const {
        size = 9,
        strong = false,
        color = COLORS.ink,
        width = 1000,
        align = "left",
      } = opts;

      const font = strong ? bold : regular;
      const str = fit(value, width, size, font);
      const tw = font.widthOfTextAtSize(str, size);

      page.drawText(str, {
        x:
          align === "right"
            ? x - tw
            : align === "center"
              ? x - tw / 2
              : x,
        y,
        size,
        font,
        color,
      });
    }

    function rect(x, y, width, height, color, border = null) {
      page.drawRectangle({
        x,
        y,
        width,
        height,
        color,
        ...(border
          ? {
              borderColor: border,
              borderWidth: 0.7,
            }
          : {}),
      });
    }

    function line(
      x1,
      y1,
      x2,
      y2,
      color = COLORS.border,
      thickness = 0.6
    ) {
      page.drawLine({
        start: { x: x1, y: y1 },
        end: { x: x2, y: y2 },
        color,
        thickness,
      });
    }

    function panel(
      x,
      bottom,
      width,
      top,
      title,
      titleBar = true
    ) {
      rect(
        x,
        bottom,
        width,
        top - bottom,
        COLORS.white,
        COLORS.border
      );

      if (titleBar) {
        rect(
          x,
          top - 29,
          width,
          29,
          COLORS.pale
        );

        text(title, x + 12, top - 19, {
          size: 10,
          strong: true,
          color: COLORS.navy,
          width: width - 24,
        });
      }
    }

    function detailPanel(
      x,
      bottom,
      width,
      top,
      compact = false
    ) {
    panel(x, bottom, width, top, "WORKER DETAILS", true);

      const fields = [
        ["Worker Name", worker.name],
        ["Worker ID", worker.workerCode],
        [
          "Company",
          worker.company?.name ||
            worker.company?.code ||
            "-",
        ],
        ["Job Title", worker.jobTitle || "-"],
        ["Nationality", worker.nationality || "-"],
        ["Joining Date", dateText(worker.joiningDate)],
        ["Leaving Date", dateText(worker.leavingDate)],
      ];

      const gap = compact ? 20.5 : 19;
      const labelWidth = compact ? 100 : 119;

      fields.forEach(([label, value], index) => {
        const rowY = top - (compact ? 43 : 44) - index * gap;

        text(label, x + 13, rowY, {
          size: compact ? 8.5 : 9.5,
          color: COLORS.muted,
          width: labelWidth - 7,
        });

        text(
          value,
          x + labelWidth + 15,
          rowY,
          {
            size: compact ? 8.8 : 10,
            strong: true,
            width: width - labelWidth - 30,
          }
        );

        if (index < fields.length - 1) {
          line(
            x + 13,
            rowY - 7,
            x + width - 13,
            rowY - 7,
            COLORS.border,
            0.35
          );
        }
      });
    }

    function table(
      x,
      top,
      width,
      bottom,
      columns,
      rows,
      total,
      fontSize = 8
    ) {
      const headerHeight = 26;

      const rowHeight = Math.min(
        24,
        (top - bottom - headerHeight - 7) /
          (rows.length + 1)
      );

      if (rowHeight < 12) {
        throw new Error(
          "Not enough room for monthly summary table"
        );
      }

      rect(
        x,
        top - headerHeight,
        width,
        headerHeight,
        COLORS.pale
      );

      let columnX = x;

      for (const column of columns) {
        text(
          column.label,
          column.right
            ? columnX + column.width - 5
            : columnX + 6,
          top - 17,
          {
            size: fontSize - 0.3,
            strong: true,
            color: COLORS.navy,
            align: column.right
              ? "right"
              : "left",
            width: column.width - 10,
          }
        );

        columnX += column.width;
      }

      let rowTop = top - headerHeight;

      function drawRow(values, isTotal, index) {
        if (isTotal || index % 2 === 1) {
          rect(
            x,
            rowTop - rowHeight,
            width,
            rowHeight,
            isTotal
              ? COLORS.pale
              : rgb(0.985, 0.99, 1)
          );
        }

        let cellX = x;

        values.forEach((value, columnIndex) => {
          const column = columns[columnIndex];

          text(
            value,
            column.right
              ? cellX + column.width - 5
              : cellX + 6,
            rowTop -
              rowHeight / 2 -
              fontSize * 0.32,
            {
              size: fontSize,
              strong: isTotal,
              color: isTotal
                ? COLORS.navy
                : COLORS.ink,
              align: column.right
                ? "right"
                : "left",
              width: column.width - 10,
            }
          );

          cellX += column.width;
        });

        rowTop -= rowHeight;

        line(
          x,
          rowTop,
          x + width,
          rowTop,
          COLORS.border,
          0.35
        );
      }

      rows.forEach((row, index) =>
        drawRow(row, false, index)
      );

      drawRow(total, true, rows.length);
    }

    const margin = includePayroll ? 28 : 38;
    const headingY = H - (includePayroll ? 35 : 39);
    const contentTop = H - (includePayroll ? 57 : 65);

    const lastMonth = monthStart(
      end.getUTCFullYear(),
      end.getUTCMonth() - 1
    );

    const rangeLabel =
      `${labelMonth(monthKey(start))} - ` +
      labelMonth(monthKey(lastMonth));

    text("WORK PROFILE", margin, headingY, {
      size: includePayroll ? 19 : 20,
      strong: true,
      color: COLORS.navy,
    });

    text(rangeLabel, W - margin, headingY + 1, {
      size: includePayroll ? 9 : 9.5,
      color: COLORS.muted,
      align: "right",
      width: includePayroll ? 310 : 260,
    });

    line(
      margin,
      headingY - 10,
      W - margin,
      headingY - 10,
      COLORS.navy,
      1.2
    );

    // Missing months display "-" instead of zero.
    const workRows = months.map((m) => [
      labelMonth(m.key, true),
      m.hasRecords ? fmt(m.hours, 1) : "-",
      m.hasRecords ? m.worked : "-",
      m.hasRecords ? m.absent : "-",
      m.hasRecords ? m.off : "-",
      m.hasRecords ? m.holiday : "-",
    ]);

    const workTotal = [
      "TOTAL",
      fmt(totals.hours, 1),
      totals.worked,
      totals.absent,
      totals.off,
      totals.holiday,
    ];

    if (includePayroll) {
      // LANDSCAPE REPORT
      const left = margin;
      const gap = 10;
      const leftWidth = 372;
      const right = left + leftWidth + gap;
      const rightWidth = W - right - margin;

      const detailBottom = 359;
      const workTop = detailBottom - 10;
      const bottom = 53;
      const payrollBottom = 156;

      detailPanel(
        left,
        detailBottom,
        leftWidth,
        contentTop,
        true
      );

      panel(
        left,
        bottom,
        leftWidth,
        workTop,
        "MONTHLY WORK SUMMARY"
      );

      const workWidths = [
        91,
        59,
        59,
        55,
        45,
        leftWidth - 309,
      ];

      const workColumns = [
        "Month",
        "Hours",
        "Worked",
        "Absent",
        "Off",
        "Holiday",
      ].map((label, index) => ({
        label,
        width: workWidths[index],
        right: index > 0,
      }));

      table(
        left,
        workTop - 30,
        leftWidth,
        bottom - 4,
        workColumns,
        workRows,
        workTotal,
        8.2
      );

      panel(
        right,
        payrollBottom,
        rightWidth,
        contentTop,
        "MONTHLY PAYROLL SUMMARY  |  AED"
      );

      const payrollWidths = [
        76,
        43,
        57,
        56,
        57,
        52,
        rightWidth - 341,
      ];

      const payrollColumns = [
        "Month",
        "Rate",
        "Gross",
        "Deduct.",
        "Advance",
        "Net",
        "Balance",
      ].map((label, index) => ({
        label,
        width: payrollWidths[index],
        right: index > 0,
      }));

      const payrollDataRows = months.map((m) => [
        labelMonth(m.key, true),
        m.rate == null ? "-" : fmt(m.rate),
        fmt(m.payroll.grossPay),
        fmt(m.payroll.absenceDeduction),
        fmt(m.payroll.totalAdvances),
        fmt(m.payroll.netPay),
        fmt(m.payroll.remainingPay),
      ]);

      const payrollTotal = [
        "TOTAL",
        "-",
        payTotal(totals.gross),
        payTotal(totals.deduction),
        fmt(totals.advances),
        payTotal(totals.net),
        payTotal(totals.balance),
      ];

      table(
        right,
        contentTop - 30,
        rightWidth,
        payrollBottom + 8,
        payrollColumns,
        payrollDataRows,
        payrollTotal,
        7.55
      );

      const summaryTop = payrollBottom - 10;

      rect(
        right,
        bottom,
        rightWidth,
        summaryTop - bottom,
        COLORS.navy
      );

      text(
        "OVERALL SUMMARY",
        right + 13,
        summaryTop - 21,
        {
          size: 10.5,
          strong: true,
          color: COLORS.white,
        }
      );

      const middle = right + rightWidth * 0.49;

      line(
        middle,
        bottom + 12,
        middle,
        summaryTop - 31,
        rgb(0.35, 0.46, 0.63)
      );

      text("WORK", right + 13, bottom + 55, {
        size: 8.5,
        strong: true,
        color: COLORS.white,
      });

      text(
        `Hours: ${fmt(totals.hours, 1)}  |  Worked: ${totals.worked}`,
        right + 13,
        bottom + 38,
        {
          size: 7.9,
          color: COLORS.white,
          width: middle - right - 19,
        }
      );

      text(
        `Absent: ${totals.absent}  |  Off: ${totals.off}  |  Holidays: ${totals.holiday}`,
        right + 13,
        bottom + 22,
        {
          size: 7.7,
          color: COLORS.white,
          width: middle - right - 19,
        }
      );

      text("PAYROLL", middle + 11, bottom + 55, {
        size: 8.5,
        strong: true,
        color: COLORS.white,
      });

      text(
        `Gross: ${payTotal(totals.gross)}  |  Net: ${payTotal(totals.net)}`,
        middle + 11,
        bottom + 38,
        {
          size: 7.6,
          color: COLORS.white,
          width: right + rightWidth - middle - 17,
        }
      );

      text(
        `Advance: ${fmt(totals.advances)}  |  Balance: ${payTotal(totals.balance)}`,
        middle + 11,
        bottom + 22,
        {
          size: 7.5,
          color: COLORS.white,
          width: right + rightWidth - middle - 17,
        }
      );
    } else {
      // PORTRAIT WORK-ONLY REPORT
      const fullWidth = W - 2 * margin;

      const detailBottom = contentTop - 171;

      detailPanel(
        margin,
        detailBottom,
        fullWidth,
        contentTop
      );

      const workTop = detailBottom - 16;
      const workBottom = 246;

      panel(
        margin,
        workBottom,
        fullWidth,
        workTop,
        "MONTHLY WORK SUMMARY"
      );

      const widths = [
        135,
        92,
        80,
        74,
        65,
        fullWidth - 446,
      ];

      const columns = [
        "Month",
        "Hours",
        "Worked",
        "Absent",
        "Off",
        "Holiday",
      ].map((label, index) => ({
        label,
        width: widths[index],
        right: index > 0,
      }));

      table(
        margin,
        workTop - 32,
        fullWidth,
        workBottom - 2,
        columns,
        workRows,
        workTotal,
        10
      );

      // Compact 87-point overall summary.
      const summaryTop = workBottom - 17;
      const summaryBottom = summaryTop - 87;

      rect(
        margin,
        summaryBottom,
        fullWidth,
        summaryTop - summaryBottom,
        COLORS.navy
      );

      text(
        "OVERALL WORK SUMMARY",
        margin + 18,
        summaryTop - 25,
        {
          size: 12,
          strong: true,
          color: COLORS.white,
        }
      );

      text(
        `Total Hours: ${fmt(totals.hours, 1)}    Worked Days: ${totals.worked}`,
        margin + 18,
        summaryTop - 50,
        {
          size: 11,
          color: COLORS.white,
          width: fullWidth - 36,
        }
      );

      text(
        `Absent: ${totals.absent}    Weekly Off: ${totals.off}    Holidays: ${totals.holiday}`,
        margin + 18,
        summaryTop - 72,
        {
          size: 10.5,
          color: COLORS.white,
          width: fullWidth - 36,
        }
      );
    }

    const generated = new Intl.DateTimeFormat(
      "en-GB",
      {
        timeZone: "Asia/Dubai",
        dateStyle: "medium",
        timeStyle: "short",
      }
    ).format(new Date());

    line(margin, 38, W - margin, 38);

    text(
      `Generated ${generated} (UAE)`,
      margin,
      23,
      {
        size: 7.5,
        color: COLORS.muted,
      }
    );

    text("Page 1 of 1", W - margin, 23, {
      size: 7.5,
      color: COLORS.muted,
      align: "right",
    });

    const bytes = await pdf.save();

    const safeCode = worker.workerCode.replace(
      /[^a-zA-Z0-9_-]/g,
      "_"
    );

    const filenameMonth = (date) =>
  new Intl.DateTimeFormat("en-GB", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  }).format(date).replace(/\s+/g, "");

const suffix =
  period === "selected-year"
    ? String(year)
    : `${filenameMonth(start)}-${filenameMonth(
        new Date(end.getTime() - 1)
      )}`;

    const filename =
      `${safeCode}-work-${suffix}` +
      `${includePayroll ? "-payroll" : ""}.pdf`;

    res.setHeader(
      "Content-Type",
      "application/pdf"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );

    res.setHeader(
      "Cache-Control",
      "private, no-store"
    );

    res.setHeader(
      "X-Content-Type-Options",
      "nosniff"
    );

    res.send(Buffer.from(bytes));
  }
);
