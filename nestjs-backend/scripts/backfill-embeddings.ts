import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { EMBEDDING_SERVICE } from '../src/infrastructure/ai/ai.di-token';
import type { IEmbeddingService } from '../src/infrastructure/ai/ai.port';
import { ChunkingService } from '../src/infrastructure/chunking/chunking.service';
import { DEFAULT_CHUNKING_STRATEGY } from '../src/infrastructure/chunking/chunking.types';
import { parseChunkingStrategy } from '../src/features/ingestion/chunking-strategy-input';
import { VectorStoreService } from '../src/infrastructure/vector-store/vector-store.service';
import { PrismaService } from '../src/shared/database/prisma.service';

/**
 * Chunks and embeds the seeded corpus, which arrives with text but no vectors.
 *
 * Runs through the application context rather than its own Prisma and Bedrock
 * clients, so it embeds by exactly the same code path as the ingestion pipeline
 * — a script with its own copy of the chunking rules is a script that silently
 * drifts from the thing it is meant to backfill.
 *
 *   pnpm backfill:embeddings
 */
async function main() {
  const logger = new Logger('backfill-embeddings');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const prisma = app.get(PrismaService, { strict: false });
  // Through the capability token, so the script embeds with whichever
  // provider AI_PROVIDER names — asking for the Bedrock class by name is how
  // this script demanded AWS credentials while the app was running on Gemini.
  const embeddings = app.get<IEmbeddingService>(EMBEDDING_SERVICE, { strict: false });
  const vectorStore = app.get(VectorStoreService, { strict: false });
  // Through the same service the consumer uses, so a strategy change lands here
  // too instead of leaving the backfill writing a value nothing else produces.
  const chunking = app.get(ChunkingService, { strict: false });

  const documents = await prisma.document.findMany({
    where: { status: 'completed', textContent: { not: null } },
    select: { id: true, filename: true, textContent: true, chunkingStrategy: true },
  });

  logger.log(`${documents.length} completed documents with text`);

  let totalChunks = 0;
  for (const document of documents) {
    // Each document's own choice, not a blanket default: this loop purges and
    // rewrites every completed document, so defaulting here would overwrite
    // the strategy its uploader picked — and drop whatever the hierarchical
    // strategies stored alongside it.
    const stored = parseChunkingStrategy(document.chunkingStrategy);
    if (stored === null) {
      // Louder here than in the worker: this rewrite is not coming back, so a
      // downgrade that goes unmentioned is a permanent disagreement between
      // the document row and its chunks.
      logger.warn(
        `${document.filename}: unusable chunking_strategy ` +
          `${JSON.stringify(document.chunkingStrategy)}; using ${DEFAULT_CHUNKING_STRATEGY}`,
      );
    }
    const strategy = stored ?? DEFAULT_CHUNKING_STRATEGY;
    const chunks = await chunking.split(document.textContent ?? '', strategy);
    if (chunks.length === 0) {
      logger.warn(`${document.filename}: no chunks, skipping`);
      continue;
    }

    // Purge first, so re-running after a mid-way failure replaces the finished
    // part instead of doubling it.
    await vectorStore.replaceChunks(
      document.id,
      chunks.map((chunk, index) => ({
        documentId: document.id,
        content: chunk.content,
        chunkingStrategy: strategy,
        chunkIndex: index,
      })),
    );

    const vectors = await embeddings.generateEmbeddings(
      chunks.map((chunk) => chunk.content),
      'search_document',
    );
    for (const [index, vector] of vectors.entries()) {
      await vectorStore.setEmbedding(document.id, index, vector);
    }

    totalChunks += chunks.length;
    logger.log(`${document.filename}: ${chunks.length} chunks embedded`);
  }

  logger.log(`done: ${totalChunks} chunks, ${await vectorStore.countEmbedded()} with a vector`);
  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
