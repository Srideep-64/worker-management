import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { saveFile, readFile, deleteFile } from "../lib/storage.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const DOCUMENT_TYPES = ["PHOTO", "PASSPORT", "VISA", "EMIRATES_ID", "LABOUR_CARD"];

export const workerParamSchema = z.object({ id: z.string().uuid() });
export const documentParamSchema = z.object({ id: z.string().uuid(), type: z.enum(DOCUMENT_TYPES) });
export const downloadQuerySchema = z.object({ download: z.enum(["1"]).optional() });
export const expiringQuerySchema = z.object({
  days: z.coerce.number().int().min(0).max(3650).default(30),
  companyId: z.string().uuid().optional(),
});

// Never trust the client-declared MIME type or filename extension: identify
// the file from its actual leading bytes and store THAT as the mime type.
export function sniffMime(buf) {
  if (buf.length >= 5 && buf.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  return null;
}

// Metadata only — the storage key is never sent to the browser.
const PUBLIC_FIELDS = {
  id: true,
  type: true,
  originalFilename: true,
  mimeType: true,
  fileSize: true,
  uploadedAt: true,
  uploadedBy: { select: { name: true } },
};

async function requireWorker(id) {
  const worker = await prisma.worker.findUnique({ where: { id }, select: { id: true } });
  if (!worker) throw ApiError.notFound("Worker not found");
  return worker;
}

export const listDocuments = asyncHandler(async (req, res) => {
  await requireWorker(req.params.id);
  const documents = await prisma.document.findMany({
    where: { workerId: req.params.id },
    select: PUBLIC_FIELDS,
    orderBy: { type: "asc" },
  });
  res.json({ documents });
});

// PUT = create-or-replace: v1 keeps exactly one current document per type.
export const putDocument = asyncHandler(async (req, res) => {
  const { id: workerId, type } = req.params;
  await requireWorker(workerId);
  if (!req.file) throw ApiError.badRequest("A file is required (field name 'file')");

  const mimeType = sniffMime(req.file.buffer);
  if (!mimeType) throw ApiError.badRequest("Unsupported file. Upload a PDF, JPEG or PNG.");
  if (type === "PHOTO" && !mimeType.startsWith("image/")) {
    throw ApiError.badRequest("A photo must be a JPEG or PNG image");
  }

  const storageKey = await saveFile(req.file.buffer, {
    prefix: `documents/${workerId}/${type}`,
    filename: req.file.originalname || "document",
    contentType: mimeType,
  });

  const existing = await prisma.document.findUnique({ where: { workerId_type: { workerId, type } } });
  const data = {
    storageKey,
    originalFilename: (req.file.originalname || "document").slice(0, 200),
    mimeType,
    fileSize: req.file.size,
    uploadedAt: new Date(),
    uploadedById: req.user.id,
  };

  let document;
  try {
    document = await prisma.document.upsert({
      where: { workerId_type: { workerId, type } },
      create: { workerId, type, ...data },
      update: data,
      select: PUBLIC_FIELDS,
    });
  } catch (err) {
    await deleteFile(storageKey).catch(() => {}); // don't orphan the new object
    throw err;
  }

  // Remove the superseded file only after the DB points at the new one.
  if (existing) await deleteFile(existing.storageKey).catch(() => {});

  res.status(existing ? 200 : 201).json({ document });
});

// Authenticated proxy: the browser never gets a storage URL or credentials.
export const streamDocument = asyncHandler(async (req, res) => {
  const { id: workerId, type } = req.params;
  const doc = await prisma.document.findUnique({ where: { workerId_type: { workerId, type } } });
  if (!doc) throw ApiError.notFound("Document not found");

  const buffer = await readFile(doc.storageKey);
  const disposition = req.query.download ? "attachment" : "inline";
  res.setHeader("Content-Type", doc.mimeType);
  res.setHeader("Content-Disposition", `${disposition}; filename*=UTF-8''${encodeURIComponent(doc.originalFilename)}`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-store");
  res.send(buffer);
});

// Expiry tracking uses the expiry dates stored on the worker record.
// Expired documents are included (daysLeft < 0) so they can't be missed.
export const listExpiring = asyncHandler(async (req, res) => {
  const { days, companyId } = req.query;
  const cutoff = new Date(Date.now() + days * 86400000);

  const workers = await prisma.worker.findMany({
    where: {
      companyId,
      OR: [{ passportExpiry: { lte: cutoff } }, { visaExpiry: { lte: cutoff } }, { emiratesIdExpiry: { lte: cutoff } }],
    },
    select: {
      id: true,
      workerCode: true,
      name: true,
      company: { select: { code: true } },
      passportExpiry: true,
      visaExpiry: true,
      emiratesIdExpiry: true,
    },
  });

  const today = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
  const items = [];
  for (const w of workers) {
    for (const [type, expiry] of [
      ["PASSPORT", w.passportExpiry],
      ["VISA", w.visaExpiry],
      ["EMIRATES_ID", w.emiratesIdExpiry],
    ]) {
      if (expiry && expiry <= cutoff) {
        items.push({
          workerId: w.id,
          workerCode: w.workerCode,
          name: w.name,
          company: w.company.code,
          type,
          expiry: expiry.toISOString().slice(0, 10),
          daysLeft: Math.round((expiry.getTime() - today) / 86400000),
        });
      }
    }
  }
  items.sort((a, b) => a.daysLeft - b.daysLeft);
  res.json({ items });
});
