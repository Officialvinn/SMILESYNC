/**
 * Environment configuration. Fails fast on a missing or weak secret.
 * Secrets come from the environment only; see .env.example (never commit .env).
 */
import { z } from 'zod';

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  /** Runtime connection, as the restricted smilesync_app role. */
  DATABASE_URL: z.string().min(1),
  /** HS256 signing secret. At least 32 characters. */
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  /** NFR 1: 32-byte AES-256 key for patient names, base64-encoded. */
  PATIENT_DATA_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, 'PATIENT_DATA_KEY must be 32 bytes, base64-encoded'),
  /** bcrypt cost. 12 in production; tests lower it for speed. */
  BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),
  /** Number of reverse proxies in front of the API (Caddy = 1), for client IPs in the audit log. */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(1),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid configuration:\n${problems}`);
  }
  if (parsed.data.NODE_ENV === 'production' && parsed.data.BCRYPT_COST < 12) {
    throw new Error('BCRYPT_COST must be at least 12 in production');
  }
  return parsed.data;
}
