import type { GoogleGenAI } from '@google/genai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '@config/env.config';
import type { ChatMessage, ILlmService, ToolSpec } from '@infrastructure/ai/ai.port';
import { TokenMeterService } from '@infrastructure/ai/token-meter.service';
import { assertGeminiConfigured, createGeminiClient, toGeminiSchema } from './gemini-client';

const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TEMPERATURE = 0;

@Injectable()
export class GeminiLlmService implements ILlmService {
  private readonly logger = new Logger(GeminiLlmService.name);
  private readonly client: GoogleGenAI;
  private readonly model: string;
  private readonly minIntervalMs: number;

  /** Serialises the pacing gate; requests queue behind one another. */
  private nextSlot = Promise.resolve();

  constructor(
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly meter: TokenMeterService,
  ) {
    this.client = createGeminiClient(config);
    this.model = this.config.get('GEMINI_LLM_MODEL', { infer: true });
    this.minIntervalMs = this.config.get('GEMINI_MIN_REQUEST_INTERVAL_MS', { infer: true });
  }

  /**
   * Spaces requests by `GEMINI_MIN_REQUEST_INTERVAL_MS`.
   *
   * Ingesting one document is one analysis call plus two per chunk, issued
   * back to back — six calls for a two-chunk file. The free tier answers 429
   * above a per-minute request ceiling that depends on the model
   * (`gemini-3.5-flash-lite` reports 15), and BullMQ retries the whole job, so
   * an unpaced run burns the allowance on retries and finishes nothing.
   * Waiting is what makes the pipeline complete at all on that plan; a paid key
   * sets the interval to 0 and pays nothing for this.
   */
  private async paced<T>(run: () => Promise<T>): Promise<T> {
    if (this.minIntervalMs <= 0) return run();

    const wait = this.nextSlot;
    let release!: () => void;
    this.nextSlot = new Promise<void>((resolve) => {
      release = resolve;
    });

    await wait;
    try {
      return await run();
    } finally {
      setTimeout(release, this.minIntervalMs);
    }
  }

  async invokeText(messages: ChatMessage[], maxTokens = DEFAULT_MAX_TOKENS): Promise<string> {
    assertGeminiConfigured(this.config, 'Answering a question');

    const response = await this.paced(() =>
      this.client.models.generateContent({
        model: this.model,
        contents: this.toContents(messages),
        config: {
          systemInstruction: this.toSystemInstruction(messages),
          maxOutputTokens: maxTokens,
          temperature: DEFAULT_TEMPERATURE,
        },
      }),
    );

    // Metered as `answer`: a plain completion is only used for answering a
    // question over the corpus.
    this.meter.record({
      provider: 'gemini',
      model: this.model,
      purpose: 'answer',
      inputTokens: response.usageMetadata?.promptTokenCount,
      outputTokens: response.usageMetadata?.candidatesTokenCount,
    });

    return response.text?.trim() ?? '';
  }

  /**
   * Constrained decoding through `responseJsonSchema`, the same job Bedrock
   * does with a pinned tool and OpenAI with strict structured outputs.
   *
   * The schema is trimmed first: Gemini rejects `additionalProperties`, which
   * OpenAI requires. The zod parse at the call site is the real gate either
   * way, so trimming only widens what reaches it.
   */
  async invokeWithToolUse<T>(tool: ToolSpec, messages: ChatMessage[]): Promise<T> {
    assertGeminiConfigured(this.config, 'Document analysis');

    const response = await this.paced(() =>
      this.client.models.generateContent({
        model: this.model,
        contents: this.toContents(messages),
        config: {
          systemInstruction: this.toSystemInstruction(messages),
          maxOutputTokens: DEFAULT_MAX_TOKENS,
          temperature: DEFAULT_TEMPERATURE,
          responseMimeType: 'application/json',
          responseJsonSchema: toGeminiSchema(tool.inputSchema),
        },
      }),
    );

    // Metered before the content check: a blocked or truncated response still
    // consumed the prompt, and leaving those calls out would make the spend
    // look smaller every time something went wrong.
    this.meter.record({
      provider: 'gemini',
      model: this.model,
      purpose: this.meter.purposeForTool(tool.name),
      inputTokens: response.usageMetadata?.promptTokenCount,
      outputTokens: response.usageMetadata?.candidatesTokenCount,
    });

    const text = response.text?.trim();
    if (!text) {
      throw new Error(
        `Gemini returned no content for "${tool.name}" (model=${this.model}) — ` +
          'a truncated or blocked response arrives this way',
      );
    }

    this.logger.debug(
      `${tool.name}: ${response.usageMetadata?.promptTokenCount ?? 0} in / ` +
        `${response.usageMetadata?.candidatesTokenCount ?? 0} out tokens`,
    );

    return JSON.parse(text) as T;
  }

  /** Gemini carries the system prompt beside the conversation, not inside it. */
  private toSystemInstruction(messages: ChatMessage[]): string | undefined {
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content);
    return system.length > 0 ? system.join('\n\n') : undefined;
  }

  private toContents(messages: ChatMessage[]) {
    return messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));
  }
}
