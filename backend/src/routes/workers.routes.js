import { Router } from "express";
import {
  getWorkerWork,
  monthQuerySchema,
  createManualWork,
  createManualWorkSchema,
  updateManualWork,
  updateManualWorkSchema,
} from "../controllers/work.controller.js";
import { validate } from "../middleware/validate.js";
import {
  listWorkers,
  listWorkersQuerySchema,
  getWorker,
  createWorker,
  createWorkerSchema,
  updateWorker,
  updateWorkerSchema,

} from "../controllers/workers.controller.js";

import {
  getWorkerPayroll,
  updateHourlyRate,
  createAdvance,
  deleteAdvance,
  payrollMonthSchema,
  updateHourlyRateSchema,
  createAdvanceSchema,
} from "../controllers/payroll.controller.js";


const router = Router();

router.get("/workers", validate({ query: listWorkersQuerySchema }), listWorkers);
router.get("/workers/:id", getWorker);
router.post("/workers", validate({ body: createWorkerSchema }), createWorker);
router.put("/workers/:id", validate({ body: updateWorkerSchema }), updateWorker);

router.get("/workers/:id/work", validate({ query: monthQuerySchema }), getWorkerWork);
router.post(
  "/workers/:id/work",
  validate({ body: createManualWorkSchema }),
  createManualWork
);
router.patch(
  "/workers/:id/work/:recordId",
  validate({ body: updateManualWorkSchema }),
  updateManualWork
);

router.get(
  "/workers/:id/payroll",
  validate({ query: payrollMonthSchema }),
  getWorkerPayroll
);

router.patch(
  "/workers/:id/payroll/rate",
  validate({ body: updateHourlyRateSchema }),
  updateHourlyRate
);

router.post(
  "/workers/:id/advances",
  validate({ body: createAdvanceSchema }),
  createAdvance
);

router.delete(
  "/workers/:id/advances/:advanceId",
  deleteAdvance
);
export default router;
