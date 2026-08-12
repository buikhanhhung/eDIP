import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type OpenAI from 'openai';
import type { EnvConfig } from '@config/env.config';
import type { ChatMessage, ILlmService, ToolSpec } from '@infrastructure/ai/ai.port';
import { TokenMeterService } from '@infrastructure/ai/token-meter.service';
import { assertOpenAiConfigured, createOpenAiClient } from './openai-client';

const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TEMPERATURE = 0;

@Injectable()
export class OpenAiLlmService implements ILlmService {
  private readonly logger = new Logger(OpenAiLlmService.name);
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly meter: TokenMeterService,
  ) {
    this.client = createOpenAiClient(config);
    this.model = this.config.get('OPENAI_LLM_MODEL', { infer: true });
  }

  async invokeText(messages: ChatMessage[], maxTokens = DEFAULT_MAX_TOKENS): Promise<string> {
    assertOpenAiConfigured(this.config, 'Answering a question');

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: messages.map((message) => ({ role: message.role, content: message.content })),
      max_completion_tokens: maxTokens,
      temperature: DEFAULT_TEMPERATURE,
    });

    // A plain completion is only used for answering a question.
    this.meter.record({
      provider: 'openai',
      model: this.model,
      purpose: 'answer',
      inputTokens: response.usage?.prompt_tokens,
      outputTokens: response.usage?.completion_tokens,
    });

    return response.choices[0]?.message?.content?.trim() ?? '';
  }

  /**
   * Structured Outputs rather than function calling.
   *
   * `strict: true` makes the platform enforce the schema, so the result needs
   * no repair pass — the same guarantee the Bedrock path gets from pinning
   * `toolChoice` to a single tool. It also refuses schemas that are loose
   * about `additionalProperties` or `required`, which is why the shared tool
   * specs are written to that stricter standard.
   */
  async invokeWithToolUse<T>(tool: ToolSpec, messages: ChatMessage[]): Promise<T> {
    assertOpenAiConfigured(this.config, 'Document analysis');

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: messages.map((message) => ({ role: message.role, content: message.content })),
      max_completion_tokens: DEFAULT_MAX_TOKENS,
      temperature: DEFAULT_TEMPERATURE,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: tool.name,
          description: tool.description,
          strict: true,
          schema: tool.inputSchema,
        },
      },
    });

    // Metered before the content checks: a refused or truncated response still
    // consumed the prompt, and skipping those calls would make the spend look
    // smaller every time something went wrong.
    this.meter.record({
      provider: 'openai',
      model: this.model,
      purpose: this.meter.purposeForTool(tool.name),
      inputTokens: response.usage?.prompt_tokens,
      outputTokens: response.usage?.completion_tokens,
    });

    const choice = response.choices[0];
    // A truncated response is still valid JSON-shaped nonsense to parse, so the
    // finish reason is checked before the content.
    if (choice?.finish_reason === 'length') {
      throw new Error(
        `OpenAI hit the token ceiling before finishing "${tool.name}" — raise max_completion_tokens or shorten the input`,
      );
    }
    if (choice?.message?.refusal) {
      throw new Error(`OpenAI refused "${tool.name}": ${choice.message.refusal}`);
    }

    const content = choice?.message?.content;
    if (!content) {
      throw new Error(`OpenAI returned no content for "${tool.name}"`);
    }

    this.logger.debug(
      `${tool.name}: ${response.usage?.prompt_tokens ?? 0} in / ${response.usage?.completion_tokens ?? 0} out tokens`,
    );

    return JSON.parse(content) as T;
  }
}
