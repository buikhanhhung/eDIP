import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '@config/env.config';
import type { IVisionService, VisionImage } from '@infrastructure/ai/ai.port';
import { assertBedrockConfigured, createBedrockClient } from './bedrock-client';

const MAX_TOKENS = 4096;

const TRANSCRIBE_PROMPT = [
  'Transcribe every piece of text visible in these images, in reading order.',
  'Preserve the original language, including Vietnamese diacritics, and keep',
  'line breaks where the layout has them. Output the transcription only — no',
  'commentary, no summary, no markdown fences. If an image contains no legible',
  'text at all, output nothing for it.',
].join(' ');

/**
 * Reads text off images with Claude, replacing the tesseract OCR eDIP v1 used.
 *
 * ECVBot has no vision capability to copy — its bedrock module handles text and
 * embeddings only — so this is written rather than ported.
 */
@Injectable()
export class BedrockVisionService implements IVisionService {
  private readonly logger = new Logger(BedrockVisionService.name);
  private readonly client: BedrockRuntimeClient;
  private readonly modelId: string;

  constructor(private readonly config: ConfigService<EnvConfig, true>) {
    this.client = createBedrockClient(config);
    this.modelId = this.config.get('BEDROCK_LLM_MODEL_ID', { infer: true });
  }

  /** All pages go in one request so the model can use surrounding context. */
  async transcribe(images: VisionImage[]): Promise<string> {
    assertBedrockConfigured(this.config, 'Reading a scanned document');

    if (images.length === 0) throw new Error('No images to transcribe');
    for (const image of images) {
      // A zero-byte render is the signature of the pdfjs init-order bug: the
      // page comes back blank, transcribes to nothing, and the document looks
      // like a bad scan instead of a misconfigured renderer.
      if (image.bytes.length === 0) throw new Error('Refusing to transcribe an empty image buffer');
    }

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
              { text: TRANSCRIBE_PROMPT },
            ],
          },
        ],
        inferenceConfig: { maxTokens: MAX_TOKENS, temperature: 0 },
      }),
    );

    const text = (response.output?.message?.content ?? [])
      .map((block) => block.text ?? '')
      .join('\n')
      .trim();

    this.logger.log(`transcribed ${images.length} image(s) into ${text.length} characters`);
    return text;
  }
}
