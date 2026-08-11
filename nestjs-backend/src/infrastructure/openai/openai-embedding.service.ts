import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type OpenAI from 'openai';
import type { EnvConfig } from '@config/env.config';
import {
  EMBEDDING_DIMENSION,
  type EmbeddingInputType,
  type IEmbeddingService,
} from '@infrastructure/ai/ai.port';
import { assertOpenAiConfigured, createOpenAiClient } from './openai-client';

/** The API accepts large batches; this keeps a single request bounded. */
const BATCH_SIZE = 96;

@Injectable()
export class OpenAiEmbeddingService implements IEmbeddingService {
  private readonly logger = new Logger(OpenAiEmbeddingService.name);
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(private readonly config: ConfigService<EnvConfig, true>) {
    this.client = createOpenAiClient(config);
    this.model = this.config.get('OPENAI_EMBEDDING_MODEL', { infer: true });
  }

  /**
   * `dimensions` is what makes this a drop-in for the Bedrock path.
   *
   * The text-embedding-3 models emit 1536 or 3072 by default and accept a
   * shortened width; asking for 1024 keeps the pgvector column and the
   * FalkorDB vector index exactly as they are. Without it, switching provider
   * would mean migrating every stored vector.
   *
   * `inputType` is accepted and ignored: Cohere asks callers to distinguish
   * document from query text, OpenAI does not. Keeping it in the signature
   * means the callers stay identical across providers.
   */
  async generateEmbeddings(
    texts: string[],
    _inputType: EmbeddingInputType = 'search_document',
  ): Promise<number[][]> {
    assertOpenAiConfigured(this.config, 'Embedding');

    const vectors: number[][] = [];
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const response = await this.client.embeddings.create({
        model: this.model,
        input: texts.slice(i, i + BATCH_SIZE),
        dimensions: EMBEDDING_DIMENSION,
      });
      vectors.push(...response.data.map((item) => item.embedding));
    }

    const wrong = vectors.find((vector) => vector.length !== EMBEDDING_DIMENSION);
    if (wrong) {
      throw new Error(
        `Embedding model "${this.model}" returned ${wrong.length}-dim vectors; expected ${EMBEDDING_DIMENSION}`,
      );
    }

    this.logger.debug(`embedded ${texts.length} texts with ${this.model}`);
    return vectors;
  }
}
