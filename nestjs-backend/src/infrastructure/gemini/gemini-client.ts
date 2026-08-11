import { GoogleGenAI } from '@google/genai';
import type { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '@config/env.config';

/**
 * Constructed even when Gemini is not the selected provider, so the key must
 * be optional here and checked at the call site instead — the same rule the
 * other two providers follow. `||` rather than `??`: a key left blank in .env
 * arrives as an empty string.
 */
export function createGeminiClient(config: ConfigService<EnvConfig, true>): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: config.get('GEMINI_API_KEY', { infer: true }) || 'gemini-api-key-not-configured',
  });
}

export function assertGeminiConfigured(
  config: ConfigService<EnvConfig, true>,
  what: string,
): void {
  if (!config.get('GEMINI_API_KEY', { infer: true })) {
    throw new Error(
      `${what} needs a Gemini key: set GEMINI_API_KEY in .env, or point AI_PROVIDER at another provider.`,
    );
  }
}

/**
 * Strips the JSON Schema keywords Gemini rejects.
 *
 * The three providers disagree about the same schema: OpenAI's strict mode
 * *requires* `additionalProperties: false`, and Gemini refuses a schema that
 * carries it. Rather than keep three copies of every tool schema, the one
 * written for the strictest reader is trimmed here for this one.
 *
 * Dropping the keyword only widens what the model may return, and every call
 * site parses the result with zod afterwards — that parse, not the schema, is
 * what finally decides whether the output is usable.
 */
export function toGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (schema === null || typeof schema !== 'object') return schema;

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    if (key === 'additionalProperties') continue;
    result[key] = toGeminiSchema(value);
  }
  return result;
}
