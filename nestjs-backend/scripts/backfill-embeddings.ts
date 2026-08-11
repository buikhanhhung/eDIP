import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { EMBEDDING_SERVICE } from '../src/infrastructure/ai/ai.di-token';
import type { IEmbeddingService } from '../src/infrastructure/ai/ai.port';
import { CHUNKING_STRATEGY, splitText } from '../src/infrastructure/chunking/text-splitter';
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

  const documents = await prisma.document.findMany({
    where: { status: 'completed', textContent: { not: null } },
    select: { id: true, filename: true, textContent: true },
  });

  logger.log(`${documents.length} completed documents with text`);

  let totalChunks = 0;
  for (const document of documents) {
    const chunks = splitText(document.textContent ?? '');
    if (chunks.length === 0) {
      logger.warn(`${document.filename}: no chunks, skipping`);
      continue;
    }

    // Purge first, so re-running after a mid-way failure replaces the finished
    // part instead of doubling it.
    await vectorStore.replaceChunks(
      document.id,
      chunks.map((content, index) => ({
        documentId: document.id,
        content,
        chunkingStrategy: CHUNKING_STRATEGY,
        chunkIndex: index,
      })),
    );

    const vectors = await embeddings.generateEmbeddings(chunks, 'search_document');
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
