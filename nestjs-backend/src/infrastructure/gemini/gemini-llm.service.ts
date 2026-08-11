import type { GoogleGenAI } from '@google/genai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '@config/env.config';
import type { ChatMessage, ILlmService, ToolSpec } from '@infrastructure/ai/ai.port';
import { assertGeminiConfigured, createGeminiClient, toGeminiSchema } from './gemini-client';

const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TEMPERATURE = 0;

@Injectable()
export class GeminiLlmService implements ILlmService {
  private readonly logger = new Logger(GeminiLlmService.name);
  private readonly client: GoogleGenAI;
  private readonly model: string;

  constructor(private readonly config: ConfigService<EnvConfig, true>) {
    this.client = createGeminiClient(config);
    this.model = this.config.get('GEMINI_LLM_MODEL', { infer: true });
  }

  async invokeText(messages: ChatMessage[], maxTokens = DEFAULT_MAX_TOKENS): Promise<string> {
    assertGeminiConfigured(this.config, 'Answering a question');

    const response = await this.client.models.generateContent({
      model: this.model,
      contents: this.toContents(messages),
      config: {
        systemInstruction: this.toSystemInstruction(messages),
        maxOutputTokens: maxTokens,
        temperature: DEFAULT_TEMPERATURE,
      },
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

    const response = await this.client.models.generateContent({
      model: this.model,
      contents: this.toContents(messages),
      config: {
        systemInstruction: this.toSystemInstruction(messages),
        maxOutputTokens: DEFAULT_MAX_TOKENS,
        temperature: DEFAULT_TEMPERATURE,
        responseMimeType: 'application/json',
        responseJsonSchema: toGeminiSchema(tool.inputSchema),
      },
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
