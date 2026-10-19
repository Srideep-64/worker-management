import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler.js";
import { monthSchema } from "../utils/dates.js";
import { WorkService } from "../service/work.service.js";

/* Validation schemas */
export const monthQuerySchema = z.object({
  month: monthSchema.optional(),
});

export const createManualWorkBatchSchema = z.object({
  records: z.array(
    z.object({
      recordId: z.string().uuid().optional(),
      workDate: z.coerce.date(),
      roleId: z.string().uuid().optional(),
      status: z.enum(["WORKED", "ABSENT", "HOLIDAY", "WEEKLY_OFF"]),
      hours: z.coerce.number().gt(0).max(24).optional(),
    }),
  ).min(1).max(31),
});

/* Controllers */

export const getWorkerWork = asyncHandler(async (req, res) => {
  const result = await WorkService.getWorkerWork(req.params.id, req.query.month);
  res.json(result);
});

export const createManualWorkBatch = asyncHandler(async (req, res) => {
  const result = await WorkService.createManualWorkBatch(req.params.id, req.body.records);
  res.status(200).json(result);
});

export const getCompanyStats = asyncHandler(async (req, res) => {
  const result = await WorkService.getCompanyStats(req.params.id, req.query.month);
  res.json(result);
});