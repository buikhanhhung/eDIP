import type { GoogleGenAI } from '@google/genai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '@config/env.config';
import type { IVisionService, VisionImage } from '@infrastructure/ai/ai.port';
import { assertGeminiConfigured, createGeminiClient } from './gemini-client';

const MAX_TOKENS = 4096;

const TRANSCRIBE_PROMPT = [
  'Transcribe every piece of text visible in these images, in reading order.',
  'Preserve the original language, including Vietnamese diacritics, and keep',
  'line breaks where the layout has them. Output the transcription only — no',
  'commentary, no summary, no markdown fences. If an image contains no legible',
  'text at all, output nothing for it.',
].join(' ');

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

    if (images.length === 0) throw new Error('No images to transcribe');
    for (const image of images) {
      // A zero-byte render is the signature of the pdfjs init-order bug: the
      // page comes back blank, transcribes to nothing, and the document looks
      // like a bad scan instead of a misconfigured renderer.
      if (image.bytes.length === 0) throw new Error('Refusing to transcribe an empty image buffer');
    }

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
            { text: TRANSCRIBE_PROMPT },
          ],
        },
      ],
      config: { maxOutputTokens: MAX_TOKENS, temperature: 0 },
    });

    const text = response.text?.trim() ?? '';
    this.logger.log(`transcribed ${images.length} image(s) into ${text.length} characters`);
    return text;
  }
}
