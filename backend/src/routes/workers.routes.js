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
export default router;
