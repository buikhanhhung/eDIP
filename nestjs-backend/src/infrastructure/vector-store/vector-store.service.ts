import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';

export interface ChunkRecord {
  documentId: string;
  content: string;
  chunkingStrategy: string;
  chunkIndex: number;
  /** Filled by the embedding step; null until then. */
  embedding?: number[] | null;
}

/**
 * Raw SQL because `embedding` is a pgvector column Prisma models as
 * `Unsupported(...)` and therefore refuses to write through the client.
 *
 * Every value is bound positionally — no interpolation into the statement
 * text — so `$queryRawUnsafe` here carries no injection surface.
 */
@Injectable()
export class VectorStoreService {
  private readonly logger = new Logger(VectorStoreService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Purge-then-insert is what makes re-running a job safe. Called
   * unconditionally, including on the first run: skipping it "because there is
   * nothing to delete yet" is how a retried job ends up with doubled chunks.
   */
  async replaceChunks(documentId: string, chunks: ChunkRecord[]): Promise<void> {
    await this.deleteByDocument(documentId);
    if (chunks.length === 0) return;

    for (const chunk of chunks) {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO embedding_chunks (document_id, content, chunking_strategy, chunk_index, embedding)
         VALUES ($1, $2, $3, $4, $5::vector)`,
        chunk.documentId,
        chunk.content,
        chunk.chunkingStrategy,
        chunk.chunkIndex,
        chunk.embedding ? toVectorLiteral(chunk.embedding) : null,
      );
    }
    this.logger.log(`wrote ${chunks.length} chunks for ${documentId}`);
  }

  async deleteByDocument(documentId: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `DELETE FROM embedding_chunks WHERE document_id = $1`,
      documentId,
    );
  }

  /** Fills embeddings for chunks already written, keyed by chunk index. */
  async setEmbedding(documentId: string, chunkIndex: number, embedding: number[]): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `UPDATE embedding_chunks SET embedding = $1::vector WHERE document_id = $2 AND chunk_index = $3`,
      toVectorLiteral(embedding),
      documentId,
      chunkIndex,
    );
  }

  async countByDocument(documentId: string): Promise<number> {
    const rows = await this.prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT count(*)::bigint AS count FROM embedding_chunks WHERE document_id = $1`,
      documentId,
    );
    return Number(rows[0]?.count ?? 0);
  }
}

/** pgvector's text input format: `[0.1,0.2,...]`. */
function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}
