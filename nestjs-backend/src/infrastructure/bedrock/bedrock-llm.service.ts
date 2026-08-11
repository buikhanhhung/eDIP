import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ConverseCommandOutput,
} from '@aws-sdk/client-bedrock-runtime';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '@config/env.config';
import { assertBedrockConfigured, createBedrockClient } from './bedrock-client';

export interface BedrockToolSpec {
  name: string;
  description: string;
  /** JSON Schema for the tool input — this is what pins the response shape. */
  inputSchema: Record<string, unknown>;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TEMPERATURE = 0;

/**
 * Claude through Bedrock, used only for structured extraction.
 *
 * Structured output goes through tool-use with `toolChoice` pinned to the one
 * tool, not through "ask for JSON and parse the reply". A tool-use block is
 * already parsed JSON matching the declared schema, so the whole class of
 * markdown-fence and trailing-prose failures never arises and there is no
 * strip-then-parse-then-retry loop to maintain.
 */
@Injectable()
export class BedrockLlmService {
  private readonly logger = new Logger(BedrockLlmService.name);
  private readonly client: BedrockRuntimeClient;
  private readonly modelId: string;

  constructor(private readonly config: ConfigService<EnvConfig, true>) {
    this.client = createBedrockClient(config);
    this.modelId = this.config.get('BEDROCK_LLM_MODEL_ID', { infer: true });
  }

  async invokeWithToolUse<T>(tool: BedrockToolSpec, messages: ChatMessage[]): Promise<T> {
    assertBedrockConfigured(this.config, 'Document analysis');

    const response: ConverseCommandOutput = await this.client.send(
      new ConverseCommand({
        modelId: this.modelId,
        messages: messages
          .filter((m) => m.role !== 'system')
          .map((m) => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: [{ text: m.content }],
          })),
        system: messages.filter((m) => m.role === 'system').map((m) => ({ text: m.content })),
        inferenceConfig: { maxTokens: DEFAULT_MAX_TOKENS, temperature: DEFAULT_TEMPERATURE },
        toolConfig: {
          tools: [
            {
              toolSpec: {
                name: tool.name,
                description: tool.description,
                // The SDK types this as smithy's recursive DocumentType. Our
                // plain record is wire-compatible; the cast is confined here
                // rather than spread through the public tool spec.
                inputSchema: { json: tool.inputSchema as never },
              },
            },
          ],
          toolChoice: { tool: { name: tool.name } },
        },
      }),
    );

    const toolUse = (response.output?.message?.content ?? []).find((b) => b.toolUse)?.toolUse;
    if (!toolUse || toolUse.input === undefined) {
      throw new Error(
        `Bedrock returned no tool-use block for "${tool.name}" ` +
          `(stopReason=${response.stopReason ?? 'unknown'}, model=${this.modelId})`,
      );
    }

    this.logger.debug(
      `${tool.name}: ${response.usage?.inputTokens ?? 0} in / ${response.usage?.outputTokens ?? 0} out tokens`,
    );

    return toolUse.input as T;
  }
}
