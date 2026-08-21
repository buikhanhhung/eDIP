import { Injectable, Logger } from '@nestjs/common';
import { buildOrTsQuery } from '@common/text/ts-query';
import { PrismaService } from '@shared/database/prisma.service';

export interface ChunkRecord {
  documentId: string;
  content: string;
  chunkingStrategy: string;
  chunkIndex: number;
  /**
   * The wider passage to return in place of `content`, set only by the
   * hierarchical strategies. Both retrieval queries already read it through
   * `COALESCE(parent_content, content)`, so leaving it undefined keeps the
   * previous behaviour exactly.
   */
  parentContent?: string;
  /** Per-strategy provenance: which section a chunk came from, and the like. */
  metadata?: Record<string, unknown>;
  /** Filled by the embedding step; null until then. */
  embedding?: number[] | null;
}

export interface ChunkHit {
  /** String, not number: it is used to build citation ids. */
  id: string;
  documentId: string;
  content: string;
  /** Cosine similarity mapped into [0,1]; absent on lexical hits. */
  similarity?: number;
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
        `INSERT INTO embedding_chunks (document_id, content, parent_content, chunking_strategy, chunk_index, metadata, embedding)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::vector)`,
        chunk.documentId,
        chunk.content,
        // Undefined stays NULL rather than becoming '': the read side is a
        // COALESCE, and an empty string would satisfy it and return nothing.
        chunk.parentContent || null,
        chunk.chunkingStrategy,
        chunk.chunkIndex,
        chunk.metadata ? JSON.stringify(chunk.metadata) : null,
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

  /**
   * Nearest chunks by cosine distance.
   *
   * `d.status = 'completed'` is not optional: the seed deliberately carries one
   * failed document, and without the filter a half-processed row competes for
   * rank 1 in every query.
   *
   * There is no ivfflat index by design. At thirteen vectors, `lists = 100`
   * scatters them across a hundred lists while the default single probe reads
   * one — so the index would return near-random results, slower to be wrong.
   */
  async searchByEmbedding(embedding: number[], topK: number): Promise<ChunkHit[]> {
    const rows = await this.prisma.$queryRawUnsafe<
      { id: number; documentId: string; content: string; similarity: number }[]
    >(
      `SELECT ec.id, ec.document_id AS "documentId",
              COALESCE(ec.parent_content, ec.content) AS content,
              (2 - (ec.embedding <=> $1::vector)) / 2 AS similarity
       FROM embedding_chunks ec
       JOIN "Document" d ON d.id = ec.document_id
       WHERE ec.embedding IS NOT NULL AND d.status = 'completed'
       ORDER BY ec.embedding <=> $1::vector
       LIMIT $2`,
      toVectorLiteral(embedding),
      topK,
    );
    return rows.map((row) => ({ ...row, id: String(row.id) }));
  }

  /**
   * Full-text match over chunk content, accent-folded on both sides so `hop
   * dong` reaches `hợp đồng`. Chunk-level lexical retrieval exists for /ask;
   * /search fuses at document level using the Document.search_tsv column.
   */
  async searchChunksLexical(query: string, topK: number): Promise<ChunkHit[]> {
    // OR-joined, like the document lane: a single filler word must not empty
    // the retrieval set for /ask.
    const tsquery = buildOrTsQuery(query);
    if (!tsquery) return [];

    const rows = await this.prisma.$queryRawUnsafe<
      { id: number; documentId: string; content: string }[]
    >(
      `SELECT ec.id, ec.document_id AS "documentId",
              COALESCE(ec.parent_content, ec.content) AS content
       FROM embedding_chunks ec
       JOIN "Document" d ON d.id = ec.document_id,
            to_tsquery('simple', $1) q
       WHERE d.status = 'completed'
         AND to_tsvector('simple', immutable_unaccent(ec.content)) @@ q
       ORDER BY ts_rank(to_tsvector('simple', immutable_unaccent(ec.content)), q) DESC
       LIMIT $2`,
      tsquery,
      topK,
    );
    return rows.map((row) => ({ ...row, id: String(row.id) }));
  }

  async countEmbedded(): Promise<number> {
    const rows = await this.prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT count(*)::bigint AS count FROM embedding_chunks WHERE embedding IS NOT NULL`,
    );
    return Number(rows[0]?.count ?? 0);
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
