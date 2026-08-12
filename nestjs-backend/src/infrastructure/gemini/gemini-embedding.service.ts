import type { GoogleGenAI } from '@google/genai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '@config/env.config';
import {
  EMBEDDING_DIMENSION,
  type EmbeddingInputType,
  type IEmbeddingService,
} from '@infrastructure/ai/ai.port';
import { TokenMeterService } from '@infrastructure/ai/token-meter.service';
import { assertGeminiConfigured, createGeminiClient } from './gemini-client';

const BATCH_SIZE = 96;

@Injectable()
export class GeminiEmbeddingService implements IEmbeddingService {
  private readonly logger = new Logger(GeminiEmbeddingService.name);
  private readonly client: GoogleGenAI;
  private readonly model: string;

  constructor(
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly meter: TokenMeterService,
  ) {
    this.client = createGeminiClient(config);
    this.model = this.config.get('GEMINI_EMBEDDING_MODEL', { infer: true });
  }

  /**
   * `outputDimensionality` is what keeps this interchangeable with the other
   * providers: the stored vectors, the pgvector column and the FalkorDB index
   * all stay 1024 wide.
   *
   * Gemini's embeddings are Matryoshka — a shorter vector is a prefix of the
   * full one — and only the full-length output arrives normalised. Truncating
   * to 1024 therefore leaves a vector whose magnitude is below one, which
   * quietly distorts cosine distance, so it is re-normalised here. Skipping
   * this does not fail; it just makes every similarity slightly wrong, which
   * is the harder bug to notice.
   *
   * `inputType` is accepted and ignored, as with OpenAI.
   */
  async generateEmbeddings(
    texts: string[],
    _inputType: EmbeddingInputType = 'search_document',
  ): Promise<number[][]> {
    assertGeminiConfigured(this.config, 'Embedding');

    const vectors: number[][] = [];
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const response = await this.client.models.embedContent({
        model: this.model,
        contents: batch,
        config: { outputDimensionality: EMBEDDING_DIMENSION },
      });

      // Gemini's embedding response carries no token counts — only a billable
      // character count, and only on its enterprise platform. The characters
      // are counted here instead, and the row is marked unreported so a zero
      // token figure is never read as a free call.
      this.meter.record({
        provider: 'gemini',
        model: this.model,
        purpose: 'embedding',
        inputChars: batch.reduce((sum, text) => sum + text.length, 0),
      });

      for (const embedding of response.embeddings ?? []) {
        if (!embedding.values) {
          throw new Error(`Gemini model "${this.model}" returned an embedding without values`);
        }
        vectors.push(normalise(embedding.values));
      }
    }

    if (vectors.length !== texts.length) {
      throw new Error(
        `Gemini returned ${vectors.length} embeddings for ${texts.length} texts`,
      );
    }

    const wrong = vectors.find((vector) => vector.length !== EMBEDDING_DIMENSION);
    if (wrong) {
      throw new Error(
        `Embedding model "${this.model}" returned ${wrong.length}-dim vectors; expected ${EMBEDDING_DIMENSION}. ` +
          'Pick a model that supports outputDimensionality, or the stored vectors must be rebuilt.',
      );
    }

    this.logger.debug(`embedded ${texts.length} texts with ${this.model}`);
    return vectors;
  }
}

/** Scales to unit length; a zero vector is returned untouched. */
function normalise(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0) return vector;
  return vector.map((value) => value / magnitude);
}
