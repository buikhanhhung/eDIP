import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '@config/env.config';
import {
  EMBEDDING_DIMENSION,
  type EmbeddingInputType,
  type IEmbeddingService,
} from '@infrastructure/ai/ai.port';
import { assertBedrockConfigured, createBedrockClient } from './bedrock-client';

/** Max texts per request for Cohere embed. */
const COHERE_BATCH_SIZE = 96;
/** Max characters per text. */
const MAX_TRUNCATE_LENGTH = 2047;


/**
 * Ported from ECVBot, which runs this against both model families in
 * production. Titan and Cohere have different request shapes but both produce
 * 1024-dimension vectors, which is why either can be configured without
 * re-running the migration.
 */
@Injectable()
export class BedrockEmbeddingService implements IEmbeddingService {
  private readonly logger = new Logger(BedrockEmbeddingService.name);
  private readonly client: BedrockRuntimeClient;
  private readonly modelId: string;

  constructor(private readonly config: ConfigService<EnvConfig, true>) {
    this.client = createBedrockClient(config);
    this.modelId = this.config.get('BEDROCK_EMBEDDING_MODEL_ID', { infer: true });
  }

  async generateEmbeddings(
    texts: string[],
    inputType: EmbeddingInputType = 'search_document',
  ): Promise<number[][]> {
    assertBedrockConfigured(this.config, 'Embedding');

    const truncated = texts.map((text) => text.slice(0, MAX_TRUNCATE_LENGTH));
    const vectors = this.isTitanModel()
      ? await this.invokeTitanBatch(truncated)
      : await this.invokeCohereBatch(truncated, inputType);

    // Fail with a readable message rather than pgvector's
    // "expected 1024 dimensions, not N" from a raw insert several layers down.
    const wrong = vectors.find((vector) => vector.length !== EMBEDDING_DIMENSION);
    if (wrong) {
      throw new Error(
        `Embedding model "${this.modelId}" returned ${wrong.length}-dim vectors; expected ${EMBEDDING_DIMENSION}`,
      );
    }
    return vectors;
  }

  private isTitanModel(): boolean {
    return this.modelId.startsWith('amazon.titan');
  }

  /** Titan embeds one text per call, so this loops. */
  private async invokeTitanBatch(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    for (const text of texts) {
      const response = await this.client.send(
        new InvokeModelCommand({
          modelId: this.modelId,
          contentType: 'application/json',
          accept: 'application/json',
          body: JSON.stringify({
            inputText: text,
            dimensions: EMBEDDING_DIMENSION,
            normalize: true,
          }),
        }),
      );
      const body = JSON.parse(new TextDecoder().decode(response.body));
      if (!Array.isArray(body.embedding)) {
        this.logger.error(`Titan unexpected response keys: ${Object.keys(body).join(',')}`);
        throw new Error('Titan model returned an unexpected response shape');
      }
      results.push(body.embedding);
    }
    return results;
  }

  private async invokeCohereBatch(texts: string[], inputType: string): Promise<number[][]> {
    const results: number[][] = [];
    for (let i = 0; i < texts.length; i += COHERE_BATCH_SIZE) {
      const response = await this.client.send(
        new InvokeModelCommand({
          modelId: this.modelId,
          contentType: 'application/json',
          accept: 'application/json',
          body: JSON.stringify({
            texts: texts.slice(i, i + COHERE_BATCH_SIZE),
            input_type: inputType,
            truncate: 'END',
            output_dimension: EMBEDDING_DIMENSION,
          }),
        }),
      );
      const body = JSON.parse(new TextDecoder().decode(response.body));
      // v4 nests under `float`; v3 returns the array directly.
      const embeddings = Array.isArray(body.embeddings)
        ? body.embeddings
        : (body.embeddings?.float ?? body.embeddings?.int8);
      if (!Array.isArray(embeddings)) {
        this.logger.error(`Cohere unexpected response keys: ${Object.keys(body).join(',')}`);
        throw new Error('Cohere model returned an unexpected embeddings shape');
      }
      results.push(...(embeddings as number[][]));
    }
    return results;
  }
}
