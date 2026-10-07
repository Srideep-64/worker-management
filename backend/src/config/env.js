import "dotenv/config";
import { z } from "zod";

const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

    PORT: z.coerce.number().int().positive().default(4000),

    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),

    JWT_SECRET: z
      .string()
      .min(16, "JWT_SECRET must be at least 16 characters"),

    JWT_EXPIRES_IN: z.string().default("7d"),

    COOKIE_NAME: z.string().default("yts_session"),

    CORS_ORIGIN: z.string().min(1, "CORS_ORIGIN is required"),

    // Storage configuration
    STORAGE_PROVIDER: z
      .enum(["local", "cloudinary"])
      .default("local"),

    STORAGE_LOCAL_DIR: z.string().default("./storage"),

    // Cloudinary
    CLOUDINARY_CLOUD_NAME: z
      .string()
      .min(1, "CLOUDINARY_CLOUD_NAME is required"),

    CLOUDINARY_API_KEY: z
      .string()
      .min(1, "CLOUDINARY_API_KEY is required"),

    CLOUDINARY_API_SECRET: z
      .string()
      .min(1, "CLOUDINARY_API_SECRET is required"),
  })

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === "production";