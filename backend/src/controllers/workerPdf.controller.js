
import { PDFDocument, StandardFonts, rgb, } from "pdf-lib";
import { prisma } from "../lib/prisma.js";
import { readFile } from "../lib/storage.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const DOCUMENT_ORDER = [
  "PASSPORT",
  "VISA",
  "EMIRATES_ID",
  "LABOUR_CARD",
];

export const downloadWorkerPdf = asyncHandler(async (req, res) => {
  const { id: workerId } = req.params;

  const worker = await prisma.worker.findUnique({
    where: { id: workerId },
    select: {
      id: true,
      workerCode: true,
      name: true,
      nationality: true,
      dateOfBirth: true,
      phone: true,
      jobTitle: true,
      company: {
        select: { code: true, name: true },
      },
    },
  });

  if (!worker) throw ApiError.notFound("Worker not found");

  const documents = await prisma.document.findMany({
    where: {
      workerId,
      type: { in: ["PHOTO", ...DOCUMENT_ORDER] },
    },
    select: {
      type: true,
      storageKey: true,
      mimeType: true,
    },
  });

  const byType = new Map(documents.map((doc) => [doc.type, doc]));

  const readStartedAt = performance.now();

const loadedDocuments = await Promise.all(
  documents.map(async (doc) => {
    const startedAt = performance.now();

    try {
      const bytes = await readFile(doc.storageKey);

      console.log(
        `[Worker PDF] ${doc.type}: ${
          (performance.now() - startedAt).toFixed(0)
        } ms, ${(bytes.length / 1024).toFixed(0)} KB`,
      );

      return [doc.type, bytes];
    } catch (error) {
      console.error(
        `[Worker PDF] ${doc.type} failed after ${
          (performance.now() - startedAt).toFixed(0)
        } ms`,
        error,
      );

      return [doc.type, null];
    }
  }),
);

const documentBytes = new Map(loadedDocuments);

console.log(
  `[Worker PDF] Storage reads: ${(
    performance.now() - readStartedAt
  ).toFixed(0)} ms`,
);

  const pdfStartedAt = performance.now();

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const width = 595.28;
  const height = 841.89;
  const margin = 44;

  const navy = rgb(0.09, 0.20, 0.35);
  const textColor = rgb(0.15, 0.18, 0.23);
  const muted = rgb(0.40, 0.45, 0.52);
  const dividerColor = rgb(0.82, 0.85, 0.89);
  const lightBackground = rgb(0.96, 0.97, 0.98);

  const companyName =
    worker.company?.name ??
    worker.company?.code ??
    "COMPANY";

  function drawText(
    page,
    value,
    x,
    y,
    size = 10,
    isBold = false,
    color = textColor,
  ) {
    page.drawText(String(value ?? "—"), {
      x,
      y,
      size,
      font: isBold ? bold : font,
      color,
      maxWidth: width - x - margin,
    });
  }

  function drawCenteredText(
    page,
    value,
    y,
    size,
    isBold = false,
    color = textColor,
  ) {
    const text = String(value ?? "—");
    const selectedFont = isBold ? bold : font;
    const textWidth = selectedFont.widthOfTextAtSize(text, size);

    page.drawText(text, {
      x: (width - textWidth) / 2,
      y,
      size,
      font: selectedFont,
      color,
    });
  }

  function drawDivider(page, y) {
    page.drawLine({
      start: { x: margin, y },
      end: { x: width - margin, y },
      thickness: 0.8,
      color: dividerColor,
    });
  }

  function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);

    return Number.isNaN(date.getTime())
      ? "—"
      : date.toISOString().slice(0, 10);
  }

  function drawFooter(page, pageNumber) {
    drawDivider(page, 35);

    drawText(
      page,
      companyName,
      margin,
      20,
      8,
      false,
      muted,
    );

    const pageLabel = `Page ${pageNumber}`;
    const labelWidth = font.widthOfTextAtSize(pageLabel, 8);

    page.drawText(pageLabel, {
      x: width - margin - labelWidth,
      y: 20,
      size: 8,
      font,
      color: muted,
    });
  }

  async function embedImage(bytes, mimeType) {
    if (mimeType === "image/jpeg") {
      return pdf.embedJpg(bytes);
    }

    if (mimeType === "image/png") {
      return pdf.embedPng(bytes);
    }

    return null;
  }

  // Fit an image inside a box without stretching or cropping it.
  async function drawDocumentImage(
    page,
    bytes,
    mimeType,
    x,
    y,
    boxWidth,
    boxHeight,
  ) {
    const image = await embedImage(bytes, mimeType);

    if (!image) return false;

    const scale = Math.min(
      boxWidth / image.width,
      boxHeight / image.height,
    );

    const renderedWidth = image.width * scale;
    const renderedHeight = image.height * scale;

    page.drawImage(image, {
      x: x + (boxWidth - renderedWidth) / 2,
      y: y + (boxHeight - renderedHeight) / 2,
      width: renderedWidth,
      height: renderedHeight,
    });

    return true;
  }

  // Preserve all pages of a source PDF.
async function appendPdfDocument(bytes) {
  const startedAt = performance.now();

  const source = await PDFDocument.load(bytes);
  const copiedPages = await pdf.copyPages(
    source,
    source.getPageIndices(),
  );

  for (const page of copiedPages) {
    pdf.addPage(page);
  }

  console.log(
    `[Worker PDF] PDF merge: ${(
      performance.now() - startedAt
    ).toFixed(0)} ms, pages=${copiedPages.length}`,
  );
}

  // --------------------------------------------------
  // PAGE 1: Worker profile + passport
  // --------------------------------------------------

  const cover = pdf.addPage([width, height]);

  // Company heading and subtitle.
  drawCenteredText(cover, companyName, 790, 19, true, navy);

  drawCenteredText(
    cover,
    "WORKER DOCUMENT PROFILE",
    766,
    11,
    true,
    muted,
  );

  cover.drawLine({
    start: { x: margin, y: 746 },
    end: { x: width - margin, y: 746 },
    thickness: 2,
    color: navy,
  });

  // Worker information.
  drawText(
    cover,
    "WORKER INFORMATION",
    margin,
    720,
    10,
    true,
    navy,
  );

  const fields = [
    ["Worker name", worker.name],
    ["Worker ID", worker.workerCode],
    ["Nationality", worker.nationality],
    ["Phone", worker.phone],
    ["Job title", worker.jobTitle],
  ];

  let fieldY = 688;

  for (const [label, value] of fields) {
    drawText(cover, label, margin, fieldY, 10, false, muted);
    drawText(cover, ":", margin + 100, fieldY, 10, false, muted);
    drawText(cover, value, margin + 112, fieldY, 10, true);
    fieldY -= 25;
  }

  // Larger worker photo.
  const photo = byType.get("PHOTO");

  if (photo) {
    try {
      const photoBytes = documentBytes.get("PHOTO");

if (photoBytes) {
  await drawDocumentImage(
    cover,
    photoBytes,
    photo.mimeType,
    width - margin - 145,
    560,
    145,
    160,
  );
}
    } catch (error) {
      console.error(
        `Could not read worker photo ${workerId}`,
        error,
      );
    }
  }

  // Passport section.
  drawDivider(cover, 525);

  drawText(
    cover,
    "PASSPORT",
    margin,
    442,
    12,
    true,
    navy,
  );

const passport = byType.get("PASSPORT");

if (passport) {
  try {
    const passportBytes = documentBytes.get("PASSPORT");

    if (passportBytes) {
      if (
        passport.mimeType === "image/jpeg" ||
        passport.mimeType === "image/png"
      ) {
        // Center passport in a dedicated area.
        await drawDocumentImage(
          cover,
          passportBytes,
          passport.mimeType,
          margin + 10,
          100,
          width - (margin + 10) * 2,
          320,
        );
      } else if (passport.mimeType === "application/pdf") {
        // Preserve all passport PDF pages.
        await appendPdfDocument(passportBytes);
      }
    }
  } catch (error) {
    console.error(
      `Could not include passport for worker ${workerId}`,
      error,
    );
  }
} else {
  drawText(
    cover,
    "Passport document not available",
    margin,
    470,
    10,
    false,
    muted,
  );
}
  drawFooter(cover, 1);

  // --------------------------------------------------
  // REMAINING DOCUMENTS: Two image sections per page
  // --------------------------------------------------

  const remainingTypes = DOCUMENT_ORDER.filter(
    (type) => type !== "PASSPORT" && byType.has(type),
  );

  let nextPageNumber = 2;

  // Image documents can share a page in two equal sections.
  // PDFs are appended as original pages to preserve their content.
  let pendingImageDocs = [];

  async function flushImageDocs() {
    for (let i = 0; i < pendingImageDocs.length; i += 2) {
      const page = pdf.addPage([width, height]);

      const pair = pendingImageDocs.slice(i, i + 2);
      const sectionHeight = 365;

      for (let j = 0; j < pair.length; j++) {
        const { type, bytes, mimeType } = pair[j];

        const sectionTop = height - margin - j * sectionHeight;
        const sectionBottom = sectionTop - sectionHeight;

        drawText(
          page,
          type.replaceAll("_", " "),
          margin,
          sectionTop - 18,
          12,
          true,
          navy,
        );

        drawDivider(page, sectionTop - 30);

        await drawDocumentImage(
          page,
          bytes,
          mimeType,
          margin,
          sectionBottom + 15,
          width - margin * 2,
          sectionHeight - 55,
        );

        if (j === 0 && pair.length === 2) {
          drawDivider(page, sectionBottom);
        }
      }

      drawFooter(page, nextPageNumber++);
    }

    pendingImageDocs = [];
  }

  for (const type of remainingTypes) {
    const doc = byType.get(type);

    try {
      const bytes = documentBytes.get(type);

      if (!bytes) continue;

      if (
        doc.mimeType === "image/jpeg" ||
        doc.mimeType === "image/png"
      ) {
        pendingImageDocs.push({
          type,
          bytes,
          mimeType: doc.mimeType,
        });
      } else if (doc.mimeType === "application/pdf") {
        // Finish any waiting image documents before adding a PDF.
        await flushImageDocs();
        await appendPdfDocument(bytes);
      }
    } catch (error) {
      console.error(
        `Could not include ${type} for worker ${workerId}`,
        error,
      );
    }
  }

  await flushImageDocs();

  // Save and return the final PDF.
  const saveStartedAt = performance.now();

const bytes = await pdf.save();

console.log(
  `[Worker PDF] Serialization: ${(
    performance.now() - saveStartedAt
  ).toFixed(0)} ms`,
);

console.log(
  `[Worker PDF] PDF processing total: ${(
    performance.now() - pdfStartedAt
  ).toFixed(0)} ms`,
);

  res.setHeader("Content-Type", "application/pdf");
  const shortName = worker.name.trim().split(/\s+/).slice(0, 2).join(" ");
  const filename = `${shortName}-docs.pdf`;
  const safeFilename = filename.replace(/["\\]/g, "_");

  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
  );

  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  res.send(Buffer.from(bytes));
});
