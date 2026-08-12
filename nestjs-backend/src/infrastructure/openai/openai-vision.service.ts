import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type OpenAI from 'openai';
import type { EnvConfig } from '@config/env.config';
import type { ImageReading, IVisionService, VisionImage } from '@infrastructure/ai/ai.port';
import {
  assertReadableImages,
  parseReadings,
  READ_PROMPT,
  TRANSCRIBE_PROMPT,
} from '@infrastructure/ai/vision-prompts';
import { assertOpenAiConfigured, createOpenAiClient } from './openai-client';

const MAX_TOKENS = 4096;

@Injectable()
export class OpenAiVisionService implements IVisionService {
  private readonly logger = new Logger(OpenAiVisionService.name);
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(private readonly config: ConfigService<EnvConfig, true>) {
    this.client = createOpenAiClient(config);
    this.model = this.config.get('OPENAI_VISION_MODEL', { infer: true });
  }

  async transcribe(images: VisionImage[]): Promise<string> {
    assertOpenAiConfigured(this.config, 'Reading a scanned document');
    assertReadableImages(images, 'transcribe');

    const text = (await this.complete(images, TRANSCRIBE_PROMPT)).trim();
    this.logger.log(`transcribed ${images.length} image(s) into ${text.length} characters`);
    return text;
  }

  async read(images: VisionImage[]): Promise<ImageReading[]> {
    assertOpenAiConfigured(this.config, 'Reading an image');
    assertReadableImages(images, 'read');

    const readings = parseReadings(await this.complete(images, READ_PROMPT), images.length);
    const described = readings.filter((reading) => reading.description.length > 0).length;
    this.logger.log(`read ${images.length} image(s); ${described} described`);
    return readings;
  }

  private async complete(images: VisionImage[], prompt: string): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      max_completion_tokens: MAX_TOKENS,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: [
            ...images.map((image) => ({
              type: 'image_url' as const,
              image_url: {
                url: `data:image/${image.format};base64,${image.bytes.toString('base64')}`,
              },
            })),
            { type: 'text' as const, text: prompt },
          ],
        },
      ],
    });

    return response.choices[0]?.message?.content ?? '';
  }
}
