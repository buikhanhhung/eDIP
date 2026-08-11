import { Inject, Injectable, Logger } from '@nestjs/common';
import { BedrockEmbeddingService } from '@infrastructure/bedrock/bedrock-embedding.service';
import { BedrockLlmService } from '@infrastructure/bedrock/bedrock-llm.service';
import { GRAPH_STORE } from '@features/graph/graph.di-token';
import { normalizeEntityName, type EntityType } from '@features/graph/entity-normalizer';
import type { IGraphStore, RelationInput } from '@features/graph/graph.port';
import {
  NER_SYSTEM_PROMPT,
  NER_TOOL_NAME,
  NER_TOOL_SCHEMA,
  VERIFY_SYSTEM_PROMPT,
  VERIFY_TOOL_NAME,
  VERIFY_TOOL_SCHEMA,
  nerSchema,
  relationExtractionSchema,
} from '../schemas/graph-extraction.schema';

export interface ExtractionSummary {
  entities: number;
  located: number;
  relations: number;
  droppedRelations: number;
  llmCalls: number;
}

/**
 * Two-pass graph extraction over a document's chunks, following ECVBot.
 *
 * Pass one is pure NER. Pass two re-reads the same chunk holding pass one's
 * output and may correct, drop or add entities before stating any
 * relationship. Asking a single call for entities and relations together
 * pushes a model to invent connections that justify entities it is unsure
 * about; splitting the questions lets the second pass overrule the first.
 *
 * Cost is two model calls per chunk plus one embedding batch. That is the
 * price of typed edges, and it is charged on every re-extraction — worth
 * knowing before pointing this at a large corpus.
 */
@Injectable()
export class EntityExtractionService {
  private readonly logger = new Logger(EntityExtractionService.name);

  constructor(
    private readonly llm: BedrockLlmService,
    private readonly embeddings: BedrockEmbeddingService,
    @Inject(GRAPH_STORE) private readonly graph: IGraphStore,
  ) {}

  async extractForDocument(
    documentId: string,
    documentText: string,
    chunks: string[],
  ): Promise<ExtractionSummary> {
    const summary: ExtractionSummary = {
      entities: 0,
      located: 0,
      relations: 0,
      droppedRelations: 0,
      llmCalls: 0,
    };

    /** Verified entity name (normalised) → resolved entity id, across chunks. */
    const resolved = new Map<string, string>();
    const relations: RelationInput[] = [];

    for (const [index, chunk] of chunks.entries()) {
      const verified = await this.extractChunk(chunk, index, chunks.length);
      summary.llmCalls += 2;

      // Embed all names in the chunk in one request rather than one per entity.
      const names = verified.entities.map((entity) => entity.name);
      const vectors = await this.embedNames(names);

      for (const [position, entity] of verified.entities.entries()) {
        const { entityId } = await this.graph.resolveEntity({
          name: entity.name,
          type: entity.type as EntityType,
          description: entity.description,
          embedding: vectors?.[position] ?? null,
        });

        const { located } = await this.graph.linkMention(
          documentId,
          entityId,
          entity.name,
          documentText,
        );

        resolved.set(normalizeEntityName(entity.name), entityId);
        summary.entities += 1;
        if (located) summary.located += 1;
      }

      for (const relation of verified.relationships) {
        const sourceId = resolved.get(normalizeEntityName(relation.source));
        const targetId = resolved.get(normalizeEntityName(relation.target));

        // Rule 2 of the prompt, enforced here rather than trusted: an endpoint
        // that is not in the verified entity list is a name the model invented
        // while writing the relationship.
        if (!sourceId || !targetId) {
          this.logger.warn(
            `dropped relation ${relation.source} -[${relation.type}]-> ${relation.target}: endpoint not among verified entities`,
          );
          summary.droppedRelations += 1;
          continue;
        }

        relations.push({
          sourceEntityId: sourceId,
          targetEntityId: targetId,
          type: relation.type,
          description: relation.description,
          evidence: relation.evidence,
          confidence: relation.confidence,
        });
      }
    }

    summary.relations = await this.graph.replaceRelations(documentId, relations);

    this.logger.log(
      `[${documentId}] extraction: ${summary.entities} entities (${summary.located} located), ` +
        `${summary.relations} relations, ${summary.droppedRelations} dropped, ${summary.llmCalls} model calls`,
    );
    return summary;
  }

  /** NER, then verification-and-relations, over one chunk. */
  private async extractChunk(chunk: string, index: number, total: number) {
    const label = `chunk ${index + 1}/${total}`;

    const nerRaw = await this.llm.invokeWithToolUse<unknown>(
      {
        name: NER_TOOL_NAME,
        description: 'Trích mọi thực thể có tên trong đoạn văn bản.',
        inputSchema: NER_TOOL_SCHEMA,
      },
      [
        { role: 'system', content: NER_SYSTEM_PROMPT },
        { role: 'user', content: `<document>\n${chunk}\n</document>` },
      ],
    );

    const ner = nerSchema.safeParse(nerRaw);
    if (!ner.success) {
      throw new Error(`NER output did not match the schema (${label}): ${ner.error.issues[0]?.message}`);
    }

    const candidateList = ner.data.entities
      .map((entity) => `- ${entity.name} [${entity.type}] — ${entity.description}`)
      .join('\n');

    const verifyRaw = await this.llm.invokeWithToolUse<unknown>(
      {
        name: VERIFY_TOOL_NAME,
        description: 'Kiểm lại thực thể và rút ra quan hệ giữa chúng, kèm câu văn làm bằng chứng.',
        inputSchema: VERIFY_TOOL_SCHEMA,
      },
      [
        { role: 'system', content: VERIFY_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            'Thực thể đã trích ở bước 1:',
            candidateList || '(chưa trích được thực thể nào)',
            '',
            `<document>\n${chunk}\n</document>`,
          ].join('\n'),
        },
      ],
    );

    const verified = relationExtractionSchema.safeParse(verifyRaw);
    if (!verified.success) {
      throw new Error(
        `Relation output did not match the schema (${label}): ${verified.error.issues[0]?.message}`,
      );
    }

    this.logger.debug(
      `${label}: ${ner.data.entities.length} → ${verified.data.entities.length} entities, ` +
        `${verified.data.relationships.length} relations`,
    );
    return verified.data;
  }

  /**
   * Embeddings feed the similarity branch of dedup only. If the call fails the
   * pipeline continues without it: dedup falls back to exact-key matching,
   * which produces duplicate nodes a human can merge — better than failing a
   * document that was otherwise extracted cleanly.
   */
  private async embedNames(names: string[]): Promise<number[][] | null> {
    if (names.length === 0) return null;
    try {
      return await this.embeddings.generateEmbeddings(names, 'search_document');
    } catch (error) {
      this.logger.warn(
        `name embedding failed, dedup falls back to exact match: ${(error as Error).message}`,
      );
      return null;
    }
  }
}
