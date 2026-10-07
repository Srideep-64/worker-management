import { Router } from "express";
import { getCompanyStats, monthQuerySchema } from "../controllers/work.controller.js";
import { validate } from "../middleware/validate.js";
import {
  listCompanies,
  getCompany,
  createCompany,
  createCompanySchema,
} from "../controllers/companies.controller.js";

const router = Router();

router.get("/companies", listCompanies);
router.get("/companies/:id", getCompany);
router.get("/companies/:id/stats", validate({ query: monthQuerySchema }), getCompanyStats);
router.post("/companies", validate({ body: createCompanySchema }), createCompany);

export default router;
