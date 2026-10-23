import { Router } from "express";
import { listLogs, listLogUsers } from "../controllers/logs.controller.js";

const router = Router();
router.get("/", listLogs);
router.get("/users", listLogUsers);   // GET only: logs are read-only
export default router;