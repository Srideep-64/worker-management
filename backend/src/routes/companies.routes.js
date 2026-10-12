import { Router } from "express";
import { getCompanyStats, monthQuerySchema } from "../controllers/work.controller.js";
import { validate } from "../middleware/validate.js";
import {
  listCompanies,
  getCompany,
  createCompany,
  createCompanySchema,
} from "../controllers/companies.controller.js";

import {
  getCompanyReportChecks,
  companyReportQuerySchema,
  exportCompanyMonthlyExcel,
  exportCompanyMonthlyPdf,
} from "../controllers/companyReports.controller.js";

const router = Router();

router.get("/companies", listCompanies);
router.get("/companies/:id", getCompany);
router.get("/companies/:id/stats", validate({ query: monthQuerySchema }), getCompanyStats);
router.post("/companies", validate({ body: createCompanySchema }), createCompany);
router.get(
  "/companies/:id/monthly-report/checks",
  validate({ query: companyReportQuerySchema }),
  getCompanyReportChecks
);
router.get(
  "/companies/:id/monthly-report/excel",
  validate({ query: companyReportQuerySchema }),
  exportCompanyMonthlyExcel
);
router.get(
  "/companies/:id/monthly-report/pdf",
  validate({ query: companyReportQuerySchema }),
  exportCompanyMonthlyPdf
);
export default router;
