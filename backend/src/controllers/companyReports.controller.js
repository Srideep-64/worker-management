import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { monthRange,monthSchema, currentMonthString, formatReportMonth } from "../utils/dates.js";
import { getCompanyMonthlyReport } from "../utils/companyMonthlyReport.js";

export const companyReportQuerySchema = z.object({
  month: monthSchema.optional(),
});

export const getCompanyReportChecks = asyncHandler(async (req, res) => {
  const company = await prisma.company.findUnique({
    where: { id: req.params.id },
    select: { id: true },
  });

  if (!company) {
    throw ApiError.notFound("Company not found");
  }

  const month = req.query.month || currentMonthString();
  const { start, end } = monthRange(month);

  const workers = await prisma.worker.findMany({
    where: {
        companyId: company.id,
        joiningDate: { lt: end },
        OR: [
          { leavingDate: null },
          { leavingDate: { gte: start } },
        ],
      },
    orderBy: { workerCode: "asc" },
    select: {
      id: true,
      workerCode: true,
      name: true,
      payrolls: {
        where: { payrollMonth: start },
        select: { hourlyRate: true },
      },
      workRecords: {
        where: { workDate: { gte: start, lt: end } },
        select: { workDate: true },
      },
    },
  });

  const workersWithoutRate = workers
    .filter((worker) => worker.payrolls.length === 0)
    .map(({ workerCode, name }) => ({ workerCode, name }));

  const workersWithoutAttendance = workers
    .filter((worker) => worker.workRecords.length === 0)
    .map(({ workerCode, name }) => ({ workerCode, name }));

  const report = await getCompanyMonthlyReport(company.id, month);

  const workersWithIncompleteAttendance = report.workers
    .filter((worker) => worker.dailyRecords.some((day) => day.status === null))
    .map((worker) => ({
      workerCode: worker.workerCode,
      name: worker.name,
      missingDays: worker.dailyRecords
        .filter((day) => day.status === null)
        .map((day) => day.day),
    }));

  res.json({
    month,
    workerCount: workers.length,
    workersWithoutRate,
    workersWithoutAttendance,
    workersWithIncompleteAttendance,
    canGenerate: true,
  });
});


export const exportCompanyMonthlyExcel = asyncHandler(
  async (req, res) => {
    const month = req.query.month || currentMonthString();
    const displayMonth = formatReportMonth(month);

    const report = await getCompanyMonthlyReport(
      req.params.id,
      month
    );
    function hoursFormat(value) {
    const hundredths = Math.round(Number(value) * 100);

    if (hundredths % 100 === 0) return "0";
    if (hundredths % 10 === 0) return "0.0";
    return "0.00";
  }

    const headers = [
      "S.No.",
      "Worker ID",
      "Worker Name",
      "Role",
      ...Array.from(
        { length: report.daysInMonth },
        (_, index) => `${index + 1}`
      ),
      "Total Hrs",
      "A",
      "H",
      "W",
    ];

    const rows = report.workers.map((worker, index) => [
      index + 1,
      worker.workerCode,
      worker.name,
      worker.roleCode,
      ...worker.dailyRecords.map((day) => {
        if (!day.status) return "—";
        if (day.status === "WORKED") return day.hours ?? 0;
        if (day.status === "ABSENT") return "A";
        if (day.status === "WEEKLY_OFF") return "W";
        if (day.status === "HOLIDAY") return "H";
        return "—";
      }),
      worker.totalHours,
      worker.absentDays,
      worker.holidays,
      worker.weeklyOffs,
    ]);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "UAE Labor Management Portal";
    workbook.created = report.generatedAt;

    const worksheet = workbook.addWorksheet(
      "Monthly Attendance",
      {
        views: [{ showGridLines: false }],
      }
    );

    const totalColumns = headers.length;
    const lastColumn = totalColumns;
    const headerRowNumber = 6;
    const firstDataRow = 7;

    // Column widths.
    worksheet.columns = [
      { width: 7 },  // S.No.
      { width: 12 }, // Worker ID
      { width: 26 }, // Worker Name
      { width: 12 }, // Role
      ...Array.from(
        { length: report.daysInMonth },
        () => ({ width: 6 })
      ),
      { width: 11 }, // Total Hrs
      { width: 6 },  // A
      { width: 6 },  // H
      { width: 6 },  // W
    ];

    // Report heading rows: one merged cell across the report.
    const generatedAt = new Intl.DateTimeFormat("en-AE", {
      timeZone: "Asia/Dubai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    }).format(report.generatedAt);

    const headingRows = [
      `${report.company.name} — ${displayMonth} Attendance`,
      `Company Code: ${report.company.code}`,
      `Reporting Month: ${displayMonth}`,
      `Generated At: ${generatedAt} UAE time`,
    ];

    headingRows.forEach((text, index) => {
      const rowNumber = index + 1;

      worksheet.mergeCells(
        rowNumber,
        1,
        rowNumber,
        lastColumn
      );

      const cell = worksheet.getCell(rowNumber, 1);
      cell.value = text;
      cell.alignment = {
        horizontal: "center",
        vertical: "middle",
      };

      cell.font = {
        name: "Arial",
        size: index === 0 ? 16 : 10,
        bold: index < 2,
        color: {
          argb: index === 0 ? "FF1C2127" : "FF555555",
        },
      };

      worksheet.getRow(rowNumber).height =
        index === 0 ? 30 : 22;
    });

    // Blank row between report headings and attendance table.
    worksheet.getRow(5).height = 10;

    // Attendance table header.
    const headerRow = worksheet.getRow(headerRowNumber);
    headerRow.values = headers;
    headerRow.height = 26;

    headerRow.eachCell((cell) => {
      cell.font = {
        name: "Arial",
        bold: true,
        color: { argb: "FFFFFFFF" },
        size: 9,
      };

      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF303946" },
      };

      cell.alignment = {
        horizontal: "center",
        vertical: "middle",
        wrapText: true,
      };

      cell.border = {
        top: { style: "thin", color: { argb: "FFADB5BD" } },
        bottom: { style: "thin", color: { argb: "FFADB5BD" } },
        left: { style: "thin", color: { argb: "FFADB5BD" } },
        right: { style: "thin", color: { argb: "FFADB5BD" } },
      };
    });

    // Attendance rows.
    rows.forEach((values, index) => {
      const rowNumber = firstDataRow + index;
      const row = worksheet.getRow(rowNumber);
      row.values = values;
      row.height = 20;

      row.eachCell((cell) => {
        cell.font = {
          name: "Arial",
          size: 9,
          color: { argb: "FF1C2127" },
        };

        cell.alignment = {
          horizontal: "center",
          vertical: "middle",
        };

        cell.border = {
          top: { style: "thin", color: { argb: "FFD9DEE5" } },
          bottom: { style: "thin", color: { argb: "FFD9DEE5" } },
          left: { style: "thin", color: { argb: "FFD9DEE5" } },
          right: { style: "thin", color: { argb: "FFD9DEE5" } },
        };
      });

      // Display daily worked hours with exactly 2 decimals.
      // Keep numeric values numeric for Excel calculations.
      for (let day = 1; day <= report.daysInMonth; day++) {
      const cell = row.getCell(4 + day);

      if (typeof cell.value === "number") {
        cell.numFmt = hoursFormat(cell.value);
      }
    }

      // Total Hrs column comes immediately after the day columns.
      const totalHoursCell = row.getCell(
        5 + report.daysInMonth
      );

      totalHoursCell.numFmt = hoursFormat(totalHoursCell.value);

      // Keep worker names left-aligned for readability.
      row.getCell(3).alignment = {
        horizontal: "left",
        vertical: "middle",
      };
    });

    // Highlight Sundays, from the day header through the last worker.
    // Day columns begin at column 5.
    for (let day = 1; day <= report.daysInMonth; day++) {
      const date = new Date(
        Number(month.slice(0, 4)),
        Number(month.slice(5, 7)) - 1,
        day
      );

      if (date.getDay() !== 0) continue;

      const columnNumber = 4 + day;

      for (
        let rowNumber = headerRowNumber;
        rowNumber <= headerRowNumber + rows.length;
        rowNumber++
      ) {
        const cell = worksheet.getCell(
          rowNumber,
          columnNumber
        );

        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFFEB99" },
        };

        // Keep the Sunday header bold and readable.
        if (rowNumber === headerRowNumber) {
          cell.font = {
            name: "Arial",
            bold: true,
            size: 9,
            color: { argb: "FF1C2127" },
          };
        }
      }
    }

    // Freeze the headings and the table header while scrolling.
    worksheet.views = [
      {
        state: "frozen",
        ySplit: headerRowNumber,
        showGridLines: false,
      },
    ];

    // Keep the used report area as the print area.
    worksheet.pageSetup = {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printArea: `A1:${worksheet.getColumn(lastColumn).letter}${Math.max(
        headerRowNumber,
        headerRowNumber + rows.length
      )}`,
    };

    const buffer = await workbook.xlsx.writeBuffer();

    const filename =
      `attendance-${report.company.code}-${month}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );

    res.send(Buffer.from(buffer));
  }
);





export const exportCompanyMonthlyPdf = asyncHandler(async (req, res) => {
  const month = req.query.month || currentMonthString();
  const displayMonth = formatReportMonth(month);

  const report = await getCompanyMonthlyReport(
    req.params.id,
    month
  );

  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margins: {
      top: 20,
      right: 24,
      bottom: 40,
      left: 24,
    },
    bufferPages: true,
  });

  const safeCode = String(report.company.code).replace(
    /[^a-zA-Z0-9_-]/g,
    "_"
  );

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="payroll-${safeCode}-${month}.pdf"`
  );

  doc.pipe(res);

  const C = {
    navy: "#17283F",
    blue: "#245A81",
    ink: "#233246",
    muted: "#64748B",
    border: "#DCE4ED",
    stripe: "#F5F8FC",
    white: "#FFFFFF",
    pale: "#EDF3F9",
  };

  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;

  const left = 24;
  const right = pageWidth - 24;
  const usableWidth = right - left;

  const rowHeight = 28;
  const headerHeight = 35;

  // Reserve only the space needed for the footer.
  // Rows can occupy the remaining usable page area.
  const footerLineY = pageHeight - 39;
  const footerTextY = pageHeight - 29;
  const tableBottom = footerLineY - 8;

  const totals = report.totals;

  const fmtNumber = (value, digits = 2) =>
    value == null
      ? "N/A"
      : Number(value).toLocaleString("en-AE", {
          minimumFractionDigits: digits,
          maximumFractionDigits: digits,
        });

  const generatedAt =
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Dubai",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(report.generatedAt) + " UAE";

  // 11-column payroll table
  const columns = [
    { label: "S.No.", width: 36, align: "center" },
    { label: "Worker ID", width: 75 },
    { label: "Worker Name", width: 145 },
    { label: "Role", width: 60 },
    { label: "Absent", width: 49, align: "center" },
    { label: "Hours", width: 57, align: "right" },
    { label: "Rate", width: 57, align: "right" },
    { label: "Gross", width: 80, align: "right" },
    { label: "Deduct.", width: 75, align: "right" },
    { label: "Advances", width: 83, align: "right" },
    { label: "Balance", width: 87, align: "right" },
  ];

  const baseWidth = columns.reduce(
    (sum, col) => sum + col.width,
    0
  );

  columns.forEach((col) => {
    col.width = (col.width / baseWidth) * usableWidth;
  });

  function drawCellText(
    value,
    x,
    y,
    width,
    height,
    options = {}
  ) {
    const {
      size = 9,
      color = C.ink,
      bold = false,
      align = "left",
      padding = 5,
    } = options;

    const textHeight = size * 1.3;

    doc
      .font(bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(size)
      .fillColor(color)
      .text(
        String(value ?? "-"),
        x + padding,
        y + (height - textHeight) / 2,
        {
          width: Math.max(1, width - padding * 2),
          height: textHeight,
          align,
          lineBreak: false,
          ellipsis: true,
        }
      );
  }

  // Header on every page
  function drawPageHeading() {
    doc.rect(0, 0, pageWidth, 8).fill(C.navy);

    doc
      .font("Helvetica-Bold")
      .fontSize(22)
      .fillColor(C.navy)
      .text(report.company.name, left, 23, {
        width: usableWidth - 220,
        height: 28,
        lineBreak: false,
        ellipsis: true,
      });

    doc
      .font("Helvetica")
      .fontSize(9.8)
      .fillColor(C.muted)
      .text(
        `Company Code: ${report.company.code}`,
        left,
        54,
        {
          width: usableWidth - 220,
          height: 15,
          lineBreak: false,
        }
      );

    // Prominent reporting month
    const boxWidth = 190;
    const boxHeight = 54;
    const boxX = right - boxWidth;

    doc
      .roundedRect(boxX, 17, boxWidth, boxHeight, 6)
      .fill(C.pale);

    doc
      .font("Helvetica-Bold")
      .fontSize(9.2)
      .fillColor(C.muted)
      .text("REPORTING MONTH", boxX + 10, 24, {
        width: boxWidth - 20,
        height: 14,
        align: "center",
        lineBreak: false,
      });

    doc
      .font("Helvetica-Bold")
      .fontSize(18.4)
      .fillColor(C.navy)
      .text(displayMonth, boxX + 10, 41, {
        width: boxWidth - 20,
        height: 24,
        align: "center",
        lineBreak: false,
        ellipsis: true,
      });

    doc
      .moveTo(left, 78)
      .lineTo(right, 78)
      .strokeColor(C.border)
      .lineWidth(0.7)
      .stroke();
  }

  function drawMetric(x, y, width, label, value) {
    const height = 55;

    doc
      .roundedRect(x, y, width, height, 5)
      .fill(C.pale);

    doc
      .font("Helvetica")
      .fontSize(9.2)
      .fillColor(C.muted)
      .text(label, x + 11, y + 9, {
        width: width - 22,
        height: 13,
        lineBreak: false,
      });

    doc
      .font("Helvetica-Bold")
      .fontSize(17.3)
      .fillColor(C.navy)
      .text(String(value), x + 11, y + 29, {
        width: width - 22,
        height: 22,
        lineBreak: false,
        ellipsis: true,
      });
  }

  drawPageHeading();

  doc
    .font("Helvetica-Bold")
    .fontSize(11.5)
    .fillColor(C.blue)
    .text("MONTHLY PAYROLL REPORT", left, 88, {
      height: 17,
      lineBreak: false,
    });

  const cardY = 110;
  const cardGap = 10;
  const cardWidth = (usableWidth - cardGap * 3) / 4;

  [
    ["Total workers", totals.workerCount],
    ["Total hours", fmtNumber(totals.totalHours)],
    ["Net Pay (AED)", fmtNumber(totals.netPay)],
    ["Balance (AED)", fmtNumber(totals.remainingPay)],
  ].forEach(([label, value], i) => {
    drawMetric(
      left + i * (cardWidth + cardGap),
      cardY,
      cardWidth,
      label,
      value
    );
  });

  doc
    .font("Helvetica")
    .fontSize(9.2)
    .fillColor(C.muted)
    .text(
      `Workers without rate: ${totals.workersWithoutRate}`,
      left,
      174,
      {
        width: usableWidth,
        height: 14,
        lineBreak: false,
      }
    );

  doc
    .font("Helvetica-Bold")
    .fontSize(10.4)
    .fillColor(C.navy)
    .text("PAYROLL BREAKDOWN", left, 195, {
      height: 16,
      lineBreak: false,
    });

  doc
    .font("Helvetica")
    .fontSize(9.2)
    .fillColor(C.muted)
    .text(
      "All monetary amounts in AED",
      right - 215,
      195,
      {
        width: 215,
        height: 15,
        align: "right",
        lineBreak: false,
      }
    );

  let y = 216;

  function drawTableHeader() {
    doc
      .rect(left, y, usableWidth, headerHeight)
      .fill(C.navy);

    let x = left;

    for (const col of columns) {
      drawCellText(
        col.label,
        x,
        y,
        col.width,
        headerHeight,
        {
          size: 9.2,
          bold: true,
          color: C.white,
          align: col.align || "left",
          padding: 4,
        }
      );

      x += col.width;
    }

    y += headerHeight;
  }

  function drawTableRow(cells, index, isTotal = false) {
    const background = isTotal
      ? C.pale
      : index % 2 === 0
      ? C.white
      : C.stripe;

    doc
      .rect(left, y, usableWidth, rowHeight)
      .fill(background);

    let x = left;

    cells.forEach((cell, i) => {
      const col = columns[i];

      drawCellText(
        cell,
        x,
        y,
        col.width,
        rowHeight,
        {
          size: 9,
          bold: isTotal,
          color: isTotal ? C.navy : C.ink,
          align: col.align || "left",
          padding: 4,
        }
      );

      x += col.width;
    });

    doc
      .moveTo(left, y + rowHeight)
      .lineTo(right, y + rowHeight)
      .strokeColor(C.border)
      .lineWidth(0.35)
      .stroke();

    y += rowHeight;
  }

  function nextPage() {
    doc.addPage();
    drawPageHeading();

    // Compact continuation pages:
    // table begins immediately below the header.
    y = 90;

    drawTableHeader();
  }

  drawTableHeader();

  // Fit as many rows as possible above the footer.
  // No unnecessary bottom padding.
  for (const [index, worker] of report.workers.entries()) {
    if (y + rowHeight > tableBottom) {
      nextPage();
    }

    drawTableRow(
      [
        index + 1,
        worker.workerCode,
        worker.name,
        worker.roleCode ?? "-",
        worker.absentDays,
        fmtNumber(worker.totalHours),
        fmtNumber(worker.hourlyRate),
        fmtNumber(worker.grossPay),
        fmtNumber(worker.absenceDeduction),
        fmtNumber(worker.totalAdvances),
        fmtNumber(worker.remainingPay),
      ],
      index
    );
  }

  // Totals row
  if (y + rowHeight > tableBottom) {
    nextPage();
  }

  drawTableRow(
    [
      "",
      "TOTAL",
      "",
      "",
      totals.absentDays,
      fmtNumber(totals.totalHours),
      "",
      fmtNumber(totals.grossPay),
      fmtNumber(totals.absenceDeduction),
      fmtNumber(totals.totalAdvances),
      fmtNumber(totals.remainingPay),
    ],
    report.workers.length,
    true
  );

  // Page numbers and generated time
  // Both use exactly the same Y position.
  const pageRange = doc.bufferedPageRange();
  const pageCount = pageRange.count;

  for (
    let pageIndex = pageRange.start;
    pageIndex < pageRange.start + pageCount;
    pageIndex++
  ) {
    doc.switchToPage(pageIndex);

    doc
      .moveTo(left, footerLineY)
      .lineTo(right, footerLineY)
      .strokeColor(C.border)
      .lineWidth(0.6)
      .stroke();

    // Prevent automatic page breaks while drawing footers.
    const originalBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    doc
      .font("Helvetica")
      .fontSize(9.2)
      .fillColor(C.muted)
      .text(
        `Generated: ${generatedAt}`,
        left,
        footerTextY,
        {
          width: usableWidth / 2,
          height: 14,
          lineBreak: false,
        }
      );

    doc
      .font("Helvetica")
      .fontSize(9.2)
      .fillColor(C.muted)
      .text(
        `Page ${pageIndex - pageRange.start + 1} of ${pageCount}`,
        right - 150,
        footerTextY,
        {
          width: 150,
          height: 14,
          align: "right",
          lineBreak: false,
        }
      );

    doc.page.margins.bottom = originalBottomMargin;
  }

  doc.end();
});

