import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '@config/env.config';
import type { ImageReading, IVisionService, VisionImage } from '@infrastructure/ai/ai.port';
import {
  assertReadableImages,
  parseReadings,
  READ_PROMPT,
  TRANSCRIBE_PROMPT,
} from '@infrastructure/ai/vision-prompts';
import { TokenMeterService } from '@infrastructure/ai/token-meter.service';
import { assertBedrockConfigured, createBedrockClient } from './bedrock-client';

const MAX_TOKENS = 4096;

/**
 * Reads images with Claude, replacing the tesseract OCR eDIP v1 used.
 *
 * ECVBot has no vision capability to copy — its bedrock module handles text and
 * embeddings only — so this is written rather than ported.
 */
@Injectable()
export class BedrockVisionService implements IVisionService {
  private readonly logger = new Logger(BedrockVisionService.name);
  private readonly client: BedrockRuntimeClient;
  private readonly modelId: string;

  constructor(
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly meter: TokenMeterService,
  ) {
    this.client = createBedrockClient(config);
    this.modelId = this.config.get('BEDROCK_LLM_MODEL_ID', { infer: true });
  }

  /** All pages go in one request so the model can use surrounding context. */
  async transcribe(images: VisionImage[]): Promise<string> {
    assertBedrockConfigured(this.config, 'Reading a scanned document');
    assertReadableImages(images, 'transcribe');

    const text = (await this.converse(images, TRANSCRIBE_PROMPT)).trim();
    this.logger.log(`transcribed ${images.length} image(s) into ${text.length} characters`);
    return text;
  }

  async read(images: VisionImage[]): Promise<ImageReading[]> {
    assertBedrockConfigured(this.config, 'Reading an image');
    assertReadableImages(images, 'read');

    const readings = parseReadings(await this.converse(images, READ_PROMPT), images.length);
    const described = readings.filter((reading) => reading.description.length > 0).length;
    this.logger.log(`read ${images.length} image(s); ${described} described`);
    return readings;
  }

  private async converse(images: VisionImage[], prompt: string): Promise<string> {
    const response = await this.client.send(
      new ConverseCommand({
        modelId: this.modelId,
        messages: [
          {
            role: 'user',
            content: [
              ...images.map((image) => ({
                image: { format: image.format, source: { bytes: new Uint8Array(image.bytes) } },
              })),
              { text: prompt },
            ],
          },
        ],
        inferenceConfig: { maxTokens: MAX_TOKENS, temperature: 0 },
      }),
    );

    this.meter.record({
      provider: 'bedrock',
      model: this.modelId,
      purpose: 'vision',
      inputTokens: response.usage?.inputTokens,
      outputTokens: response.usage?.outputTokens,
    });

    return (response.output?.message?.content ?? []).map((block) => block.text ?? '').join('\n');
  }
}
