import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { downloadMimeFor } from '@infrastructure/storage/allowlist';
import { LocalStorageService } from '@infrastructure/storage/local-storage.service';
import { PrismaService } from '@shared/database/prisma.service';
import { GRAPH_STORE } from '@features/graph/graph.di-token';
import type { IGraphStore } from '@features/graph/graph.port';

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

  async list(query: ListDocumentsQuery) {
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

  async findOne(id: string) {
    const doc = await this.prisma.document.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, email: true } },
        entities: {
          include: { entity: { select: { id: true, type: true, displayName: true } } },
        },
      },
    });
    if (!doc) throw new NotFoundException(`Document ${id} not found`);

    const { storagePath: _storagePath, ...rest } = doc;
    return {
      ...rest,
      entities: doc.entities.map((de) => ({
        id: de.entity.id,
        type: de.entity.type,
        displayName: de.entity.displayName,
        mentionText: de.mentionText,
        charStart: de.charStart,
        charEnd: de.charEnd,
        confidence: de.confidence,
      })),
    };
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
      select: { metadata: true, textContent: true },
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

    if (patch.parties !== undefined) {
      await this.graph.deleteByDocument(id, ['company']);
      await this.graph.upsertDocumentEntities(
        id,
        existing.textContent ?? '',
        patch.parties.map((party) => ({ type: 'company', value: party })),
      );
    }

    return updated;
  }

  /**
   * Database first, disk second.
   *
   * Reversed, a failed delete leaves a row pointing at a file that no longer
   * exists and every later read throws. This way the worst case is an orphaned
   * file, which nothing reads.
   */
  async remove(id: string): Promise<{ id: string }> {
    const doc = await this.prisma.document.findUnique({
      where: { id },
      select: { storagePath: true },
    });
    if (!doc) throw new NotFoundException(`Document ${id} not found`);

    // embedding_chunks and DocumentEntity both cascade.
    await this.prisma.document.delete({ where: { id } });
    await this.storage.remove(doc.storagePath);

    this.logger.log(`deleted document ${id}`);
    return { id };
  }

  /**
   * Dashboard aggregates. `byType` counts only analysed documents, so a file
   * still being processed does not land in an arbitrary bucket — the same
   * split eDIP v1 used.
   */
  async stats() {
    const [total, byStatusRaw, byTypeRaw] = await Promise.all([
      this.prisma.document.count(),
      this.prisma.document.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.document.groupBy({
        by: ['documentType'],
        _count: { _all: true },
        where: { documentType: { not: null } },
      }),
    ]);

    const toMap = <T extends string>(rows: { _count: { _all: number } }[], keys: (T | null)[]) =>
      Object.fromEntries(
        rows.map((row, i) => [keys[i] ?? 'unknown', row._count._all]),
      ) as Record<string, number>;

    return {
      total,
      byStatus: toMap(byStatusRaw, byStatusRaw.map((r) => r.status)),
      byType: toMap(byTypeRaw, byTypeRaw.map((r) => r.documentType)),
    };
  }
}
