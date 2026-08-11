import { z } from 'zod';

/**
 * Fail fast at boot rather than at the first Bedrock call or the first login.
 * AWS credentials are optional here so the app still starts (and the whole
 * non-AI half of the demo still works) before real keys are plugged in — but
 * the Bedrock services check for them and refuse clearly if they are missing.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().min(1),

  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6383),

  AWS_REGION: z.string().default('ap-southeast-1'),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  BEDROCK_EMBEDDING_MODEL_ID: z.string().default('amazon.titan-embed-text-v2:0'),
  BEDROCK_LLM_MODEL_ID: z
    .string()
    .default('global.anthropic.claude-sonnet-4-5-20250929-v1:0'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  STORAGE_DIR: z.string().default('./storage'),

  SEED_ADMIN_EMAIL: z.string().email().default('admin@ecloudvalley.demo'),
  SEED_USER_EMAIL: z.string().email().default('user@ecloudvalley.demo'),
  SEED_VIEWER_EMAIL: z.string().email().default('viewer@ecloudvalley.demo'),
  SEED_ADMIN_PASSWORD: z.string().optional(),
  SEED_USER_PASSWORD: z.string().optional(),
  SEED_VIEWER_PASSWORD: z.string().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): EnvConfig {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${detail}`);
  }
  return parsed.data;
}

/** True when both keys are present — the SDK ignores profile/SSO otherwise. */
export function hasAwsCredentials(env: Pick<EnvConfig, 'AWS_ACCESS_KEY_ID' | 'AWS_SECRET_ACCESS_KEY'>): boolean {
  return Boolean(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY);
}
