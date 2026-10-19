import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { monthRange, currentMonthString, formatReportMonth } from "../utils/dates.js";
import { getCompanyMonthlyReport } from "../utils/companyMonthlyReport.js";

export const companyReportQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
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
        OR: [
          {
            joiningDate: { lt: end },
            leavingDate: null,
          },
          {
            joiningDate: { lt: end },
            leavingDate: { gte: start },
          },
          {
            workRecords: {
              some: {
                workDate: { gte: start, lt: end },
              },
            },
          },
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
        () => ({ width: 5 })
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


export const exportCompanyMonthlyPdf = asyncHandler(
  async (req, res) => {
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
        top: 30,
        bottom: 38,
        left: 24,
        right: 24,
      },
      bufferPages: true,
      autoFirstPage: true,
    });

    const safeCode = report.company.code.replace(
      /[^a-zA-Z0-9_-]/g,
      "_"
    );

    res.setHeader(
      "Content-Type",
      "application/pdf"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="payroll-${safeCode}-${month}.pdf"`
    );

    doc.pipe(res);

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const left = doc.page.margins.left;
    const right = pageWidth - doc.page.margins.right;
    const bottom = pageHeight - doc.page.margins.bottom - 25;

    const money = (value) =>
      value == null
        ? "N/A"
        : Number(value).toLocaleString("en-AE", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });

        const generatedAt = new Intl.DateTimeFormat("en-AE", {
        timeZone: "Asia/Dubai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        }).format(report.generatedAt) + " UAE time";

    // Report heading
    doc
      .font("Helvetica-Bold")
      .fontSize(17)
      .text(report.company.name, left, 26, {
        width: right - left,
      });

    doc
      .font("Helvetica")
      .fontSize(10)
      .text(`Company Code: ${report.company.code}`, left, 48);

    doc.text(`Reporting Month: ${displayMonth}`, left, 61);

    doc.text(`Generated At: ${generatedAt}`, left, 74);

    const totals = report.totals;

    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .text("Monthly Summary", left, 94);

    doc
      .font("Helvetica")
      .fontSize(9)
      .text(
        `Workers: ${totals.workerCount}   |   ` +
        `Hours: ${money(totals.totalHours)}   |   ` +
        `Worked: ${totals.workedDays}   |   ` +
        `Absent: ${totals.absentDays}   |   ` +
        `Holidays: ${totals.holidays}   |   ` +
        `Weekly Offs: ${totals.weeklyOffs}`,
        left,
        109,
        { width: right - left }
      );

    doc
      .font("Helvetica")
      .fontSize(9)
      .text(
        `Workers without payroll rates: ${totals.workersWithoutRate}`,
        left,
        122
      );

    doc
      .font("Helvetica")
      .fontSize(8)
      .text(
        "Payroll totals below include workers with configured rates. " +
        "Total advances include all workers. N/A means payroll cannot be calculated.",
        left,
        135,
        { width: right - left }
      );


    const columns = [
      { label: "S.No.", key: "serialNumber", width: 26 },
      { label: "Worker ID", key: "workerCode", width: 58 },
      { label: "Name", key: "name", width: 85 },
      { label: "Worked", key: "workedDays", width: 38 },
      { label: "Absent", key: "absentDays", width: 38 },
      { label: "Role", key: "role", width: 55 },
      { label: "Rate (AED)", key: "hourlyRate", width: 50 },
      { label: "Hours", key: "totalHours", width: 38 },
      { label: "Gross (AED)", key: "grossPay", width: 55 },
      { label: "Deduct. (AED)", key: "absenceDeduction", width: 55 },
      { label: "Net (AED)", key: "netPay", width: 50 },
      { label: "Advances (AED)", key: "totalAdvances", width: 55 },
      { label: "Remaining (AED)", key: "remainingPay", width: 58 },
      { label: "S.No.", key: "serialNumberEnd", width: 26 },
    ];


    const tableWidth = columns.reduce(
      (sum, column) => sum + column.width,
      0
    );

    const tableLeft = left;
    const rowHeight = 25;
    let y = 154;

    function drawTableHeader() {
      let x = tableLeft;

      doc.font("Helvetica-Bold").fontSize(7);

      for (const column of columns) {
        doc
          .rect(x, y, column.width, rowHeight)
          .fillAndStroke("#E8E8E8", "#999999");

        doc
          .fillColor("#111111")
          .text(
            column.label,
            x + 3,
            y + 7,
            {
              width: column.width - 6,
              height: rowHeight - 6,
              lineBreak: true,
            }
          );

        x += column.width;
      }

      y += rowHeight;
    }

    function drawRow(values, bold = false) {
      let x = tableLeft;

      doc
        .font(bold ? "Helvetica-Bold" : "Helvetica")
        .fontSize(7.5)
        .fillColor("#111111");

      for (let i = 0; i < columns.length; i += 1) {
        const column = columns[i];

        doc
          .rect(x, y, column.width, rowHeight)
          .strokeColor("#BBBBBB")
          .stroke();

        doc.text(
          String(values[i] ?? "N/A"),
          x + 3,
          y + 8,
          {
            width: column.width - 6,
            height: rowHeight - 8,
            ellipsis: true,
            lineBreak: false,
          }
        );

        x += column.width;
      }

      y += rowHeight;
    }

    function addTablePage() {
      doc.addPage();
      y = 35;
      drawTableHeader();
    }

    drawTableHeader();

    for (const [index,worker] of report.workers.entries()) {
      if (y + rowHeight > bottom - 5) {
        addTablePage();
      }


    drawRow([
      index + 1,
      worker.workerCode,
      worker.name,
      worker.workedDays,
      worker.absentDays,
      worker.role,
      money(worker.hourlyRate),
      money(worker.totalHours),
      money(worker.grossPay),
      money(worker.absenceDeduction),
      money(worker.netPay),
      money(worker.totalAdvances),
      money(worker.remainingPay),
      index + 1,
    ]);

    }


    const totalsRow = [
      "",
      "TOTAL",
      "",
      totals.workedDays,
      totals.absentDays,
      "",
      "",
      money(totals.totalHours),
      money(totals.grossPay),
      money(totals.absenceDeduction),
      money(totals.netPay),
      money(totals.totalAdvances),
      money(totals.remainingPay),
      "",
    ];


    if (y + rowHeight > bottom - 5) {
      addTablePage();
    }

    drawRow(totalsRow, true);

    // Add page numbers and footer dates to every page.
    // Add page numbers and footer dates to every page.
        const pageRange = doc.bufferedPageRange();

        for (
        let pageIndex = pageRange.start;
        pageIndex < pageRange.start + pageRange.count;
        pageIndex += 1
        ) {
        doc.switchToPage(pageIndex);

        // Allow footer text below the normal content boundary.
        const originalBottomMargin = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;

        doc
            .font("Helvetica")
            .fontSize(7.5)
            .fillColor("#555555")
            .text(
            `Generated: ${generatedAt}`,
            left,
            pageHeight - 50,
            {
                width: tableWidth / 2,
                height: 10,
                lineBreak: false,
            }
            );

        doc.text(
            `Page ${pageIndex + 1} of ${pageRange.count}`,
            right - 120,
            pageHeight - 50,
            {
            width: 120,
            height: 10,
            align: "right",
            lineBreak: false,
            }
        );

        // Restore the original margin.
        doc.page.margins.bottom = originalBottomMargin;
        }

        doc.end();
  }
);
