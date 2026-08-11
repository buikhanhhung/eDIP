import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type OpenAI from 'openai';
import type { EnvConfig } from '@config/env.config';
import type { IVisionService, VisionImage } from '@infrastructure/ai/ai.port';
import { assertOpenAiConfigured, createOpenAiClient } from './openai-client';

const MAX_TOKENS = 4096;

const TRANSCRIBE_PROMPT = [
  'Transcribe every piece of text visible in these images, in reading order.',
  'Preserve the original language, including Vietnamese diacritics, and keep',
  'line breaks where the layout has them. Output the transcription only — no',
  'commentary, no summary, no markdown fences. If an image contains no legible',
  'text at all, output nothing for it.',
].join(' ');

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

    if (images.length === 0) throw new Error('No images to transcribe');
    for (const image of images) {
      // A zero-byte render is the signature of the pdfjs init-order bug: the
      // page comes back blank, transcribes to nothing, and the document looks
      // like a bad scan instead of a misconfigured renderer.
      if (image.bytes.length === 0) throw new Error('Refusing to transcribe an empty image buffer');
    }

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
            { type: 'text' as const, text: TRANSCRIBE_PROMPT },
          ],
        },
      ],
    });

    const text = response.choices[0]?.message?.content?.trim() ?? '';
    this.logger.log(`transcribed ${images.length} image(s) into ${text.length} characters`);
    return text;
  }
}
