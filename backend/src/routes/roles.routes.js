import { Router } from "express";
import { listRoles } from "../controllers/roles.controller.js";

const router = Router();

router.get("/roles", listRoles);

export default router;
