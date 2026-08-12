import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { downloadMimeFor } from '@infrastructure/storage/allowlist';
import { LocalStorageService } from '@infrastructure/storage/local-storage.service';
import { PrismaService } from '@shared/database/prisma.service';
import { GRAPH_STORE } from '@features/graph/graph.di-token';
import type { IGraphStore } from '@features/graph/graph.port';
import { toMetadataCsv } from './metadata-csv';

export interface MetadataPatch {
  title?: string;
  documentType?: string;
  parties?: string[];
  date?: string | null;
  amount?: string | null;
  keywords?: string[];
}

export interface ListDocumentsQuery {
  q?: string;
  type?: string;
  status?: string;
  from?: string;
  to?: string;
  take?: number;
  skip?: number;
}

/** Beyond this an export is a data dump, and one that would not fit in memory. */
const MAX_EXPORT_ROWS = 10_000;

/** Columns safe to send to a list view — never the full extracted text. */
const LIST_SELECT = {
  id: true,
  filename: true,
  documentType: true,
  typeConfidence: true,
  status: true,
  error: true,
  title: true,
  language: true,
  metadata: true,
  uploadedAt: true,
  processedAt: true,
  owner: { select: { id: true, email: true } },
} satisfies Prisma.DocumentSelect;

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: LocalStorageService,
    @Inject(GRAPH_STORE) private readonly graph: IGraphStore,
  ) {}

  /**
   * Shared by the list and the export, so a CSV holds exactly the rows the
   * reader was looking at when they asked for it.
   */
  private buildWhere(query: ListDocumentsQuery): Prisma.DocumentWhereInput {
    const where: Prisma.DocumentWhereInput = {};

    if (query.type) where.documentType = query.type;
    if (query.status) where.status = query.status as Prisma.EnumDocumentStatusFilter['equals'];
    if (query.from || query.to) {
      where.uploadedAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }
    // Name/title contains — this is the library's cheap filter, distinct from
    // the semantic search in /search.
    if (query.q) {
      where.OR = [
        { filename: { contains: query.q, mode: 'insensitive' } },
        { title: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  /**
   * The filtered rows as a CSV.
   *
   * Capped well above any corpus this is meant for: an export is a read of the
   * whole result set, and one that streamed a million rows into memory would
   * take the API down rather than answer slowly.
   */
  async exportCsv(query: ListDocumentsQuery): Promise<string> {
    const documents = await this.prisma.document.findMany({
      where: this.buildWhere(query),
      select: LIST_SELECT,
      orderBy: { uploadedAt: 'desc' },
      take: MAX_EXPORT_ROWS,
    });

    this.logger.log(`exported ${documents.length} document(s) as CSV`);
    return toMetadataCsv(documents);
  }

  async list(query: ListDocumentsQuery) {
    const where = this.buildWhere(query);

    const [items, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        select: LIST_SELECT,
        orderBy: { uploadedAt: 'desc' },
        take: Math.min(query.take ?? 50, 200),
        skip: query.skip ?? 0,
      }),
      this.prisma.document.count({ where }),
    ]);

    return { items, total };
  }

  /**
   * The row from Postgres, its entities from the graph.
   *
   * A graph read that fails degrades to an empty entity list rather than a
   * failed request: the document, its text and its metadata are all in
   * Postgres and worth showing on their own. The page loses highlighting, not
   * its content.
   */
  async findOne(id: string) {
    const doc = await this.prisma.document.findUnique({
      where: { id },
      include: { owner: { select: { id: true, email: true } } },
    });
    if (!doc) throw new NotFoundException(`Document ${id} not found`);

    let entities: Awaited<ReturnType<IGraphStore['getEntitiesForDocument']>> = [];
    try {
      entities = await this.graph.getEntitiesForDocument(id);
    } catch (error) {
      this.logger.warn(`could not read entities for ${id} from the graph: ${(error as Error).message}`);
    }

    const { storagePath: _storagePath, ...rest } = doc;
    return { ...rest, entities };
  }

  /** Small enough to poll every second or two while a job runs. */
  async status(id: string) {
    const doc = await this.prisma.document.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        error: true,
        textSource: true,
        documentType: true,
        processedAt: true,
      },
    });
    if (!doc) throw new NotFoundException(`Document ${id} not found`);
    return doc;
  }

  /**
   * The original bytes. Served as an attachment with `nosniff`, and .html/.xml
   * downgraded to text/plain by `downloadMimeFor` — an uploaded page served
   * inline from this origin would run as this origin.
   */
  async download(id: string) {
    const doc = await this.prisma.document.findUnique({
      where: { id },
      select: { filename: true, storagePath: true },
    });
    if (!doc) throw new NotFoundException(`Document ${id} not found`);

    return {
      buffer: await this.storage.read(doc.storagePath),
      filename: doc.filename,
      mimeType: downloadMimeFor(doc.filename),
    };
  }

  /**
   * Corrects what the model got wrong, with attribution.
   *
   * Editing `parties` re-derives the company links this document contributes to
   * the graph: a person who fixes the AI must see the graph follow them, not
   * the AI. Only company links are replaced — wiping every link would delete
   * people, departments and projects the editor never touched.
   *
   * `typeConfidence` becomes 1 when a human sets the type. A person is not 87%
   * sure.
   */
  async updateMetadata(id: string, patch: MetadataPatch, actorId: string) {
    const existing = await this.prisma.document.findUnique({
      where: { id },
      select: { metadata: true, textContent: true, filename: true, status: true },
    });
    if (!existing) throw new NotFoundException(`Document ${id} not found`);

    const current = (existing.metadata ?? {}) as Record<string, unknown>;
    const metadata: Prisma.InputJsonValue = {
      ...current,
      ...(patch.parties !== undefined ? { parties: patch.parties } : {}),
      ...(patch.date !== undefined ? { date: patch.date } : {}),
      ...(patch.amount !== undefined ? { amount: patch.amount } : {}),
      ...(patch.keywords !== undefined ? { keywords: patch.keywords } : {}),
    };

    const updated = await this.prisma.document.update({
      where: { id },
      data: {
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.documentType !== undefined
          ? { documentType: patch.documentType, typeConfidence: 1 }
          : {}),
        metadata,
        metadataEditedById: actorId,
        metadataEditedAt: new Date(),
      },
      select: { id: true, title: true, documentType: true, metadata: true, metadataEditedAt: true },
    });

    // The document node carries title, type and status, so an edit that
    // changes any of them has to reach the graph too.
    await this.graph.projectDocument({
      id,
      title: updated.title,
      filename: existing.filename,
      documentType: updated.documentType,
      status: existing.status,
    });

    if (patch.parties !== undefined) {
      const text = existing.textContent ?? '';
      await this.graph.unlinkMentions(id, ['company']);

      for (const party of patch.parties) {
        const { entityId } = await this.graph.resolveEntity({ name: party, type: 'company' });
        const charStart = text.indexOf(party);
        await this.graph.linkMention(id, entityId, {
          mentionText: party,
          charStart: charStart >= 0 ? charStart : null,
          charEnd: charStart >= 0 ? charStart + party.length : null,
        });
      }
    }

    return updated;
  }

  /**
   * Graph first, then the row, then the file.
   *
   * The graph goes first because it is the only step with nothing to fall back
   * on: no foreign key spans the two stores, so a node left behind after the
   * row is gone becomes a document on the canvas that cannot be opened. Losing
   * the row after the node is merely a repeatable delete.
   *
   * The file goes last for the same reason it always did — reversed, a failed
   * delete leaves a row pointing at a file that is no longer there, and every
   * later read throws. An orphaned file is read by nothing.
   */
  async remove(id: string): Promise<{ id: string }> {
    const doc = await this.prisma.document.findUnique({
      where: { id },
      select: { storagePath: true },
    });
    if (!doc) throw new NotFoundException(`Document ${id} not found`);

    await this.graph.deleteDocument(id);
    // embedding_chunks cascades with the row.
    await this.prisma.document.delete({ where: { id } });
    await this.storage.remove(doc.storagePath);

    this.logger.log(`deleted document ${id}`);
    return { id };
  }
}
