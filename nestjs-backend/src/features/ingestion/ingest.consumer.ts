import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Job } from 'bullmq';
import { BedrockEmbeddingService } from '@infrastructure/bedrock/bedrock-embedding.service';
import { CHUNKING_STRATEGY, splitText } from '@infrastructure/chunking/text-splitter';
import { LocalStorageService } from '@infrastructure/storage/local-storage.service';
import { VectorStoreService } from '@infrastructure/vector-store/vector-store.service';
import { PrismaService } from '@shared/database/prisma.service';
import { QUEUE_NAMES } from '@shared/queue/queue.constants';
import { GRAPH_STORE } from '@features/graph/graph.di-token';
import type { IGraphStore } from '@features/graph/graph.port';
import { DocumentAnalysisService } from './services/document-analysis.service';
import { EntityExtractionService } from './services/entity-extraction.service';
import { TextExtractionService } from './services/text-extraction.service';

export interface IngestJobData {
  documentId: string;
}

/**
 * Runs a document from `uploaded` to `completed`, or to `failed` with the
 * reason recorded on the row.
 *
 * Two invariants shape this file:
 *
 *  - **Never `completed` with empty text.** Every extraction path either
 *    produces characters or throws; the check before analysis is the backstop.
 *  - **Re-running a job is safe.** Chunks are purged before being written, so a
 *    retry replaces its predecessor's work instead of doubling it.
 *
 * Concurrency stays at 1: rasterising a PDF is CPU-bound and this worker shares
 * a process with the API.
 */
@Processor(QUEUE_NAMES.DOCUMENT_INGEST, { concurrency: 1 })
export class IngestConsumer extends WorkerHost {
  private readonly logger = new Logger(IngestConsumer.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: LocalStorageService,
    private readonly extraction: TextExtractionService,
    private readonly analysis: DocumentAnalysisService,
    private readonly vectorStore: VectorStoreService,
    private readonly embeddings: BedrockEmbeddingService,
    private readonly graphExtraction: EntityExtractionService,
    @Inject(GRAPH_STORE) private readonly graph: IGraphStore,
  ) {
    super();
  }

  async process(job: Job<IngestJobData>): Promise<void> {
    const { documentId } = job.data;
    const step = (name: string) => this.logger.log(`[${documentId}] step=${name}`);

    const document = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!document) {
      // The row is gone — deleted while queued. Nothing to do, and failing the
      // job would only retry against the same absence.
      this.logger.warn(`[${documentId}] document no longer exists; dropping job`);
      return;
    }

    await this.prisma.document.update({
      where: { id: documentId },
      data: { status: 'processing', error: null },
    });

    try {
      step('extract');
      const buffer = await this.storage.read(document.storagePath);
      const extracted = await this.extraction.extract(buffer, document.filename);

      if (extracted.text.trim().length === 0) {
        throw new Error('Extraction produced no text');
      }

      step('analyse');
      const analysis = await this.analysis.analyse(extracted.text, document.filename);

      step('chunk');
      const chunks = splitText(extracted.text);

      step('persist');
      await this.vectorStore.replaceChunks(
        documentId,
        chunks.map((content, index) => ({
          documentId,
          content,
          chunkingStrategy: CHUNKING_STRATEGY,
          chunkIndex: index,
        })),
      );

      // Chunks are written first with a null embedding, then filled. Writing
      // both at once would mean a throttled embedding call loses the text too,
      // and re-running would have nothing to replace.
      step('embed');
      const vectors = await this.embeddings.generateEmbeddings(chunks, 'search_document');
      for (const [index, vector] of vectors.entries()) {
        await this.vectorStore.setEmbedding(documentId, index, vector);
      }

      const metadata: Prisma.InputJsonValue = {
        parties: analysis.parties,
        date: analysis.date,
        amount: analysis.amount,
        keywords: analysis.keywords,
      };

      await this.prisma.document.update({
        where: { id: documentId },
        data: {
          status: 'completed',
          error: null,
          textContent: extracted.text,
          textSource: extracted.textSource,
          documentType: analysis.documentType,
          typeConfidence: analysis.typeConfidence,
          language: analysis.language,
          title: analysis.title,
          summary: analysis.summary,
          metadata,
          processedAt: new Date(),
        },
      });

      // Entities and their relations come from the chunk-level two-pass
      // pipeline, which runs after the document row is complete: a failure
      // here leaves a readable, searchable document with an empty graph,
      // rather than discarding an extraction that already succeeded.
      // The graph filters on document status and labels nodes with the title,
      // so the node has to be refreshed before anything is attached to it.
      await this.graph.projectDocument({
        id: documentId,
        title: analysis.title,
        filename: document.filename,
        documentType: analysis.documentType,
        status: 'completed',
      });

      step('extract-graph');
      const graph = await this.graphExtraction.extractForDocument(
        documentId,
        extracted.text,
        chunks,
      );

      this.logger.log(
        `[${documentId}] completed: ${extracted.textSource}, ${chunks.length} chunks, ` +
          `${graph.entities} entities (${graph.located} located), ${graph.relations} relations`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const attemptsLeft = (job.opts.attempts ?? 1) - job.attemptsMade - 1;

      // Only the final attempt marks the document failed. Flipping it on the
      // first error would show a red badge that a successful retry never
      // clears back, since nothing re-reads it.
      if (attemptsLeft <= 0) {
        await this.prisma.document.update({
          where: { id: documentId },
          data: { status: 'failed', error: message },
        });
        this.logger.error(`[${documentId}] failed after ${job.attemptsMade + 1} attempts: ${message}`);
      } else {
        this.logger.warn(`[${documentId}] attempt failed (${attemptsLeft} left): ${message}`);
      }

      // Rethrow either way: BullMQ owns the retry decision.
      throw error;
    }
  }
}
