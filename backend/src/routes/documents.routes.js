import { Router } from "express";
import multer from "multer";
import { validate } from "../middleware/validate.js";
import { ApiError } from "../utils/ApiError.js";
import {
  listDocuments,
  putDocument,
  streamDocument,
  listExpiring,
  workerParamSchema,
  documentParamSchema,
  downloadQuerySchema,
  expiringQuerySchema,
} from "../controllers/documents.controller.js";

// Coarse client-declared type check only; the controller re-checks the real
// file signature, so a renamed .exe never gets through.
const ACCEPTED = new Set(["application/pdf", "image/jpeg", "image/png"]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) =>
    ACCEPTED.has(file.mimetype) ? cb(null, true) : cb(ApiError.badRequest("Only PDF, JPEG or PNG files are accepted")),
});

const router = Router();

router.get("/documents/expiring", validate({ query: expiringQuerySchema }), listExpiring);
router.get("/workers/:id/documents", validate({ params: workerParamSchema }), listDocuments);
router.put("/workers/:id/documents/:type", validate({ params: documentParamSchema }), upload.single("file"), putDocument);
router.get(
  "/workers/:id/documents/:type/file",
  validate({ params: documentParamSchema, query: downloadQuerySchema }),
  streamDocument
);

export default router;
