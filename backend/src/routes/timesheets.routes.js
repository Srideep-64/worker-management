import { Router } from "express";
import multer from "multer";
import { validate } from "../middleware/validate.js";
import { ApiError } from "../utils/ApiError.js";
import {
  uploadTimesheet,
  uploadBodySchema,
  confirmTimesheet,
  confirmBodySchema,
  listTimesheets,
  listQuerySchema,
  getTimesheet,
  downloadSource,
} from "../controllers/timesheets.controller.js";

const ACCEPTED_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel", // .xls
]);

// Memory storage: the file never touches disk unvalidated. We only persist
// it (via saveFile) once we know which company/month it belongs to.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB is generous for a monthly timesheet
  fileFilter: (req, file, cb) => {
    if (!ACCEPTED_MIME_TYPES.has(file.mimetype)) {
      return cb(ApiError.badRequest("Only .xlsx or .xls files are accepted"));
    }
    cb(null, true);
  },
});

const router = Router();

router.get("/timesheets", validate({ query: listQuerySchema }), listTimesheets);
router.get("/timesheets/:id", getTimesheet);
router.get("/timesheets/:id/source", downloadSource);
router.post("/timesheets/upload", upload.single("file"), validate({ body: uploadBodySchema }), uploadTimesheet);
router.post("/timesheets/:id/confirm", validate({ body: confirmBodySchema }), confirmTimesheet);

export default router;
