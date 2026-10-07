import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import { env, isProduction } from "./config/env.js";
import routes from "./routes/index.js";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler.js";

export const app = express();

// Behind a reverse proxy (nginx, a load balancer) in production, needed for
// `secure` cookies and rate-limiting to see the real client IP/protocol.
app.set("trust proxy", 1);

app.use(helmet());
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true, // required so the browser sends/receives the httpOnly cookie
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

// Skip noisy request logging in tests; never log request bodies (passwords,
// document metadata) — morgan's default tokens don't include the body.
if (!isProduction) {
  app.use(morgan("dev"));
} else {
  app.use(morgan("combined"));
}

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

app.use("/api", routes);

app.use(notFoundHandler);
app.use(errorHandler);
