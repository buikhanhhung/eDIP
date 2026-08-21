import { Inject, Injectable, Logger } from '@nestjs/common';
import { splitSearchTerms } from '@common/text/ts-query';
import { EMBEDDING_SERVICE } from '@infrastructure/ai/ai.di-token';
import type { IEmbeddingService } from '@infrastructure/ai/ai.port';
import { VectorStoreService } from '@infrastructure/vector-store/vector-store.service';
import { PrismaService } from '@shared/database/prisma.service';
import { fuseRanks } from './rrf';
import { resolveSearchOptions, type SearchOptions } from './search-options';
import { buildSnippet, type Snippet } from './snippet';

// Defaults now live with the option resolver; a request that sends none gets
// exactly these, which are the values this file used to hard-code.

export interface SearchHit {
  id: string;
  title: string | null;
  filename: string;
  documentType: string | null;
  score: number;
  snippet: Snippet;
  /** Which lanes found it — makes a degraded search visible instead of silent. */
  lanes: ('vector' | 'lexical')[];
}

export interface SearchResponse {
  hits: SearchHit[];
  /** True when a lane failed and results come from the survivor only. */
  degraded: boolean;
}

/**
 * Two lanes fused by rank: pgvector similarity and Postgres full-text.
 *
 * The metadata lane the plan originally carried is gone. `metadata::text ILIKE
 * '%...%'` matches JSON *keys*, so any query containing `date`, `amount` or
 * `title` would match every row — and phase 2 folded `metadata::text` into the
 * `search_tsv` expression anyway, so the lexical lane already covers it.
 */
@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMBEDDING_SERVICE) private readonly embeddings: IEmbeddingService,
    private readonly vectorStore: VectorStoreService,
  ) {}

  async search(query: string, requested: Partial<SearchOptions> = {}): Promise<SearchResponse> {
    const options = resolveSearchOptions(requested);

    // allSettled, not all: the vector lane calls Bedrock, and one throttled
    // response must not take down an endpoint Postgres can still answer.
    // A lane switched off resolves empty rather than being skipped in the
    // fusion, so the shape below stays the same whichever lanes ran.
    const [vectorLane, lexicalLane] = await Promise.allSettled([
      options.lanes === 'lexical' ? Promise.resolve([]) : this.vectorLane(query, options.laneLimit),
      options.lanes === 'vector' ? Promise.resolve([]) : this.lexicalLane(query, options.laneLimit),
    ]);

    const vectorIds = this.laneIds(vectorLane, 'vector');
    const lexicalIds = this.laneIds(lexicalLane, 'lexical');
    const degraded = vectorLane.status === 'rejected' || lexicalLane.status === 'rejected';

    const fused = fuseRanks([vectorIds, lexicalIds]).slice(0, options.resultLimit);
    if (fused.length === 0) return { hits: [], degraded };

    const documents = await this.prisma.document.findMany({
      where: { id: { in: fused.map((entry) => entry.id) } },
      select: {
        id: true,
        title: true,
        filename: true,
        documentType: true,
        textContent: true,
        summary: true,
      },
    });
    const byId = new Map(documents.map((doc) => [doc.id, doc]));

    return {
      degraded,
      hits: fused.flatMap((entry) => {
        const doc = byId.get(entry.id);
        if (!doc) return [];
        const lanes: ('vector' | 'lexical')[] = [];
        if (vectorIds.includes(doc.id)) lanes.push('vector');
        if (lexicalIds.includes(doc.id)) lanes.push('lexical');

        return [
          {
            id: doc.id,
            title: doc.title,
            filename: doc.filename,
            documentType: doc.documentType,
            score: entry.score,
            snippet: buildSnippet(
              doc.textContent ?? doc.summary ?? '',
              query,
              options.snippetRadius,
            ),
            lanes,
          },
        ];
      }),
    };
  }

  /** Chunk hits collapsed to their best-ranked document. */
  private async vectorLane(query: string, laneLimit: number): Promise<string[]> {
    const [embedding] = await this.embeddings.generateEmbeddings([query], 'search_query');
    const hits = await this.vectorStore.searchByEmbedding(embedding, laneLimit);

    const seen: string[] = [];
    for (const hit of hits) {
      if (!seen.includes(hit.documentId)) seen.push(hit.documentId);
    }
    return seen;
  }

  /**
   * Ordered by how many distinct query terms a document matches, then by
   * `ts_rank`.
   *
   * Coverage first because `ts_rank` alone counts term frequency: for
   * `hợp đồng với Saigon Retail` a contract that repeats "hợp đồng" twenty
   * times outranks the one that actually names Saigon Retail. eDIP v1 hit the
   * same wall and answered it with a coverage floor; this is that lesson, in
   * one extra subquery.
   */
  private async lexicalLane(query: string, laneLimit: number): Promise<string[]> {
    const terms = splitSearchTerms(query);
    if (terms.length === 0) return [];
    const tsquery = terms.join(' | ');

    const rows = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT d.id
       FROM "Document" d, to_tsquery('simple', $1) q
       WHERE d.search_tsv @@ q AND d.status = 'completed'
       ORDER BY
         (SELECT count(*) FROM unnest($2::text[]) AS term
          WHERE d.search_tsv @@ to_tsquery('simple', term)) DESC,
         ts_rank(d.search_tsv, q) DESC
       LIMIT $3`,
      tsquery,
      terms,
      laneLimit,
    );
    return rows.map((row) => row.id);
  }

  private laneIds(result: PromiseSettledResult<string[]>, lane: string): string[] {
    if (result.status === 'fulfilled') return result.value;
    this.logger.warn(`${lane} lane failed, continuing without it: ${result.reason}`);
    return [];
  }
}
