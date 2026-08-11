import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { downloadMimeFor } from '@infrastructure/storage/allowlist';
import { LocalStorageService } from '@infrastructure/storage/local-storage.service';
import { PrismaService } from '@shared/database/prisma.service';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: LocalStorageService,
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
