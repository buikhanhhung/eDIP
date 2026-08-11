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

  // The knowledge graph lives here and nowhere else — entities, mentions and
  // relations have no Postgres table. The API still boots when FalkorDB is
  // down; the graph and document-detail entity list are what stop working.
  FALKORDB_HOST: z.string().default('localhost'),
  FALKORDB_PORT: z.coerce.number().int().positive().default(6384),
  FALKORDB_GRAPH: z.string().default('edip'),

  // Which provider backs the three model capabilities. Switching is a restart,
  // not a rebuild — see infrastructure/ai/ai.module.ts.
  AI_PROVIDER: z.enum(['bedrock', 'openai', 'gemini']).default('bedrock'),

  OPENAI_API_KEY: z.string().optional(),
  /** Set only for an Azure or gateway endpoint; empty means api.openai.com. */
  OPENAI_BASE_URL: z.string().optional(),
  OPENAI_LLM_MODEL: z.string().default('gpt-4o'),
  OPENAI_VISION_MODEL: z.string().default('gpt-4o'),
  /**
   * text-embedding-3 models accept a `dimensions` parameter, which is what
   * lets them fill the same 1024-wide column Bedrock does. Changing this to a
   * model without that parameter means migrating every stored vector.
   */
  OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-large'),

  GEMINI_API_KEY: z.string().optional(),
  GEMINI_LLM_MODEL: z.string().default('gemini-3.5-flash-lite'),
  GEMINI_VISION_MODEL: z.string().default('gemini-3.5-flash-lite'),
  /**
   * Must support `outputDimensionality`, for the same reason OpenAI must
   * support `dimensions`: the stored vectors are 1024 wide. Gemini's
   * embeddings are Matryoshka, so a shortened vector needs re-normalising —
   * the service does that.
   */
  GEMINI_EMBEDDING_MODEL: z.string().default('gemini-embedding-001'),
  /**
   * Minimum gap between Gemini generate calls, for models with a tight
   * per-minute quota. `gemini-2.5-flash` allows five a minute on the free tier
   * while one ingest issues six, so it needs ~13000; the flash-lite models took
   * twelve calls back to back without complaint and need none.
   */
  GEMINI_MIN_REQUEST_INTERVAL_MS: z.coerce.number().int().min(0).default(0),

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

  /** Where the web app is served from. Only consulted in production. */
  WEB_ORIGIN: z.string().default('http://localhost:5173'),

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
