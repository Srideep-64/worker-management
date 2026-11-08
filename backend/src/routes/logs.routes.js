import { Router } from "express";
import { listLogs, listLogUsers } from "../controllers/logs.controller.js";
import { dashboardLogSummary } from "../controllers/activity-summary.controller.js";

const router = Router();
router.get("/", listLogs);
router.get("/users", listLogUsers);   // GET only: logs are read-only
router.get("/summary", dashboardLogSummary);
export default router;