import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import authRoutes from "./auth.routes.js";
import companiesRoutes from "./companies.routes.js";
import workersRoutes from "./workers.routes.js";
import clientsRoutes from "./clients.routes.js";
import rolesRoutes from "./roles.routes.js";
import timesheetsRoutes from "./timesheets.routes.js";
import documentsRoutes from "./documents.routes.js";
const router = Router();

// authRoutes contains the one public endpoint (POST /auth/login) plus
// /auth/logout and /me, which apply requireAuth themselves. Every other
// router mounted below is fully gated by requireAuth here, per spec:
// "All application routes/API endpoints must require authentication except
// login."
router.use(authRoutes);
router.use(requireAuth, companiesRoutes);
router.use(requireAuth, workersRoutes);
router.use(requireAuth, clientsRoutes);
router.use(requireAuth, rolesRoutes);
router.use(requireAuth, timesheetsRoutes);
router.use(requireAuth, documentsRoutes);

export default router;
