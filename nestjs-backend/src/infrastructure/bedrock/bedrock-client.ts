import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import type { ConfigService } from '@nestjs/config';
import { hasAwsCredentials, type EnvConfig } from '@config/env.config';

/**
 * One place that builds the SDK client, so the credential rule is stated once.
 *
 * The SDK falls back to its own provider chain (profile, SSO, instance role)
 * only when `credentials` is left undefined. Passing a half-filled object
 * instead disables that fallback, so a working `aws sts get-caller-identity` is
 * not enough on its own — both keys must be present or neither.
 */
export function createBedrockClient(config: ConfigService<EnvConfig, true>): BedrockRuntimeClient {
  const accessKeyId = config.get('AWS_ACCESS_KEY_ID', { infer: true });
  const secretAccessKey = config.get('AWS_SECRET_ACCESS_KEY', { infer: true });

  return new BedrockRuntimeClient({
    region: config.get('AWS_REGION', { infer: true }),
    credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
  });
}

/**
 * Refuses early, with a message naming the fix.
 *
 * Without this the first model call fails deep inside the SDK with a generic
 * credential error, and the job it belongs to records that as the document's
 * failure reason — which reads like a broken file rather than an unconfigured
 * environment.
 */
export function assertBedrockConfigured(config: ConfigService<EnvConfig, true>, what: string): void {
  const env = {
    AWS_ACCESS_KEY_ID: config.get('AWS_ACCESS_KEY_ID', { infer: true }),
    AWS_SECRET_ACCESS_KEY: config.get('AWS_SECRET_ACCESS_KEY', { infer: true }),
  };
  if (!hasAwsCredentials(env)) {
    throw new Error(
      `${what} needs AWS credentials: set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in .env. ` +
        'Both are required — the Bedrock SDK ignores profile/SSO when only one is present.',
    );
  }
}
