import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import authRoutes from "./auth.routes.js";
import companiesRoutes from "./companies.routes.js";
import workersRoutes from "./workers.routes.js";
import rolesRoutes from "./roles.routes.js";
import timesheetsRoutes from "./timesheets.routes.js";
import documentsRoutes from "./documents.routes.js";
import dashboardRoutes from "./dashboard.routes.js"
const router = Router();

// authRoutes contains the one public endpoint (POST /auth/login) plus
// /auth/logout and /me, which apply requireAuth themselves. Every other
// router mounted below is fully gated by requireAuth here, per spec:
// "All application routes/API endpoints must require authentication except
// login."
router.use(authRoutes);
router.use(requireAuth);
router.use(dashboardRoutes);
router.use(companiesRoutes);
router.use(workersRoutes);
router.use(rolesRoutes);
router.use(timesheetsRoutes);
router.use(documentsRoutes);

export default router;
