import { Router } from "express";
import rateLimit from "express-rate-limit";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { loginSchema, login, logout, me } from "../controllers/auth.controller.js";

const router = Router();

// Slow down credential-stuffing / brute-force attempts. 4 internal users
// means legitimate traffic here is tiny, so this can be strict.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: "Too many login attempts. Try again later.", code: "RATE_LIMITED" } },
});

router.post("/auth/login", loginLimiter, validate({ body: loginSchema }), login);
router.post("/auth/logout", requireAuth, logout);
router.get("/me", requireAuth, me);

export default router;
