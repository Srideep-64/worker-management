import { Router } from "express";
import {
  listWorkers,
  getWorker,
  createWorker,
  updateWorker,
} from "../controllers/workers.controller.js";
import { createWorkerSchema, updateWorkerSchema, listWorkersQuerySchema } from "../../schemas/workers.schemas.js";

import {
  getWorkerWork,
  monthQuerySchema,
  createManualWorkBatch,
  createManualWorkBatchSchema,
} from "../controllers/work.controller.js";

import {
  getWorkerPayroll,
  updateHourlyRate,
  createAdvance,
  deleteAdvance,
  payrollMonthSchema,
  updateHourlyRateSchema,
  createAdvanceSchema,
} from "../controllers/payroll.controller.js";

import { downloadWorkerPdf } from "../controllers/workerPdf.controller.js";

import { validate } from "../middleware/validate.js";

const router = Router();

// Workers
router.get(
  "/workers",
  validate({ query: listWorkersQuerySchema }),
  listWorkers,
);

router.get("/workers/:id", getWorker);

router.post(
  "/workers",
  validate({ body: createWorkerSchema }),
  createWorker,
);

router.put(
  "/workers/:id",
  validate({ body: updateWorkerSchema }),
  updateWorker,
);

// Work records
router.get(
  "/workers/:id/work",
  validate({ query: monthQuerySchema }),
  getWorkerWork,
);


// Payroll
router.get(
  "/workers/:id/payroll",
  validate({ query: payrollMonthSchema }),
  getWorkerPayroll,
);

router.patch(
  "/workers/:id/payroll/rate",
  validate({ body: updateHourlyRateSchema }),
  updateHourlyRate,
);

router.post(
  "/workers/:id/advances",
  validate({ body: createAdvanceSchema }),
  createAdvance,
);

router.delete(
  "/workers/:id/advances/:advanceId",
  deleteAdvance,
);

router.post(
  "/workers/:id/work/batch",
  validate({ body: createManualWorkBatchSchema }),
  createManualWorkBatch,
);

router.get("/workers/:id/pdf", downloadWorkerPdf);

export default router;
