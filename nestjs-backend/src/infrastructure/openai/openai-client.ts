import type { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type { EnvConfig } from '@config/env.config';

/**
 * The SDK refuses to construct without an apiKey, and the app has to boot
 * without one: this provider may not be the configured one, and even when it
 * is, login, library and search work fine before a key arrives. A placeholder
 * keeps construction legal; `assertOpenAiConfigured` is what actually guards
 * the calls.
 */
const UNSET = 'openai-api-key-not-configured';

export function createOpenAiClient(config: ConfigService<EnvConfig, true>): OpenAI {
  // `||`, not `??`: a key left blank in .env arrives as an empty string, which
  // `??` passes straight through to an SDK that refuses to construct without
  // one — and takes the whole application down at boot with it.
  const baseURL = config.get('OPENAI_BASE_URL', { infer: true }) || undefined;

  return new OpenAI({
    apiKey: config.get('OPENAI_API_KEY', { infer: true }) || UNSET,
    ...(baseURL ? { baseURL } : {}),
  });
}

/** Refuses early, with a message naming the fix rather than the symptom. */
export function assertOpenAiConfigured(
  config: ConfigService<EnvConfig, true>,
  what: string,
): void {
  if (!config.get('OPENAI_API_KEY', { infer: true })) {
    throw new Error(
      `${what} needs an OpenAI key: set OPENAI_API_KEY in .env, or switch AI_PROVIDER back to bedrock.`,
    );
  }
}
