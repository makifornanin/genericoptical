import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  /** 32+ chars. Encrypts stored integration credentials and signs reset links. */
  APP_SECRET: z.string().min(32, "APP_SECRET must be at least 32 characters"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  /** Enables the demo banner, demo credentials on the login page and the demo reset tool. */
  DEMO_MODE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /** Directory for uploaded expense attachments (local disk adapter). */
  UPLOAD_DIR: z.string().default(".data/uploads"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration — ${issues}. See .env.example.`);
  }
  cached = parsed.data;
  return cached;
}

export const isDemoMode = () => env().DEMO_MODE;
