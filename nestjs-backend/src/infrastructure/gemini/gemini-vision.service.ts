import type { GoogleGenAI } from '@google/genai';
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
import { assertGeminiConfigured, createGeminiClient } from './gemini-client';

const MAX_TOKENS = 4096;

@Injectable()
export class GeminiVisionService implements IVisionService {
  private readonly logger = new Logger(GeminiVisionService.name);
  private readonly client: GoogleGenAI;
  private readonly model: string;

  constructor(private readonly config: ConfigService<EnvConfig, true>) {
    this.client = createGeminiClient(config);
    this.model = this.config.get('GEMINI_VISION_MODEL', { infer: true });
  }

  async transcribe(images: VisionImage[]): Promise<string> {
    assertGeminiConfigured(this.config, 'Reading a scanned document');
    assertReadableImages(images, 'transcribe');

    const text = (await this.generate(images, TRANSCRIBE_PROMPT)).trim();
    this.logger.log(`transcribed ${images.length} image(s) into ${text.length} characters`);
    return text;
  }

  async read(images: VisionImage[]): Promise<ImageReading[]> {
    assertGeminiConfigured(this.config, 'Reading an image');
    assertReadableImages(images, 'read');

    const readings = parseReadings(await this.generate(images, READ_PROMPT), images.length);
    const described = readings.filter((reading) => reading.description.length > 0).length;
    this.logger.log(`read ${images.length} image(s); ${described} described`);
    return readings;
  }

  private async generate(images: VisionImage[], prompt: string): Promise<string> {
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: [
        {
          role: 'user',
          parts: [
            ...images.map((image) => ({
              inlineData: {
                mimeType: `image/${image.format}`,
                data: image.bytes.toString('base64'),
              },
            })),
            { text: prompt },
          ],
        },
      ],
      config: { maxOutputTokens: MAX_TOKENS, temperature: 0 },
    });

    return response.text ?? '';
  }
}
