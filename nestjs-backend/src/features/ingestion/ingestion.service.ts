import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import type { DocumentSource } from '@prisma/client';
import type { Queue } from 'bullmq';
import { decodeMultipartFilename } from '@common/text/decode-multipart-filename';
import {
  DEFAULT_CHUNKING_STRATEGY,
  type ChunkingStrategyId,
} from '@infrastructure/chunking/chunking.types';
import { allowedTypeFor, rejectionMessage } from '@infrastructure/storage/allowlist';
import { LocalStorageService } from '@infrastructure/storage/local-storage.service';
import { PrismaService } from '@shared/database/prisma.service';
import { INGEST_JOB, INGEST_JOB_OPTIONS, QUEUE_NAMES } from '@shared/queue/queue.constants';
import { decideDuplicate, hashContent } from './duplicate-check';
import type { IngestJobData } from './ingest.consumer';

/** A handful is enough to tell a reader there is history; a list is not. */
const MAX_REPORTED_VERSIONS = 5;

export interface UploadedFile {
  originalname: string;
  buffer: Buffer;
  size: number;
}

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: LocalStorageService,
    @InjectQueue(QUEUE_NAMES.DOCUMENT_INGEST) private readonly queue: Queue<IngestJobData>,
  ) {}

  /**
   * `source` records which door the file came through, so the library can
   * report what a connector actually contributed. It defaults to a browser
   * upload because that is the only door that existed first.
   *
   * `chunkingStrategy` comes last and defaults, so the Drive importer keeps
   * calling this with three arguments and keeps getting the default.
   */
  async upload(
    file: UploadedFile,
    ownerId: string,
    source: DocumentSource = 'upload',
    chunkingStrategy: ChunkingStrategyId = DEFAULT_CHUNKING_STRATEGY,
  ) {
    const filename = decodeMultipartFilename(file.originalname);

    // Extension decides the type. `file.mimetype` is the client's
    // Content-Type header and is never consulted.
    const allowed = allowedTypeFor(filename);
    if (!allowed) throw new BadRequestException(rejectionMessage(filename));

    const contentHash = hashContent(file.buffer);
    const verdict = await this.checkForDuplicate(filename, contentHash);

    // Refused before anything is written: the file is byte-identical to one
    // already held, so storing it again would cost a second run of the whole
    // pipeline to produce the text the library already has.
    if (verdict.identical) {
      throw new ConflictException({
        message: `"${filename}" is already in the library, uploaded on ${verdict.identical.uploadedAt.toISOString().slice(0, 10)}.`,
        duplicateOf: verdict.identical,
      });
    }

    const storagePath = await this.storage.save(file.buffer, filename);

    const document = await this.prisma.document.create({
      data: {
        filename,
        mimeType: allowed.mime,
        sizeBytes: file.size,
        storagePath,
        contentHash,
        ownerId,
        source,
        chunkingStrategy,
        status: 'uploaded',
      },
      select: { id: true, filename: true, status: true, uploadedAt: true },
    });

    await this.queue.add(INGEST_JOB, { documentId: document.id }, INGEST_JOB_OPTIONS);
    this.logger.log(
      `queued ingest for ${document.id} (${filename})` +
        (verdict.sameName.length > 0
          ? `; ${verdict.sameName.length} earlier file(s) share this name`
          : ''),
    );

    // The earlier versions ride along so the upload page can say a file by
    // this name was already here without a second round trip.
    return { ...document, previousVersions: verdict.sameName };
  }

  /**
   * Everything already held under this name, with its hash, so one query
   * answers both "have I seen these bytes" and "is this a new version".
   */
  private async checkForDuplicate(filename: string, contentHash: string) {
    const existing = await this.prisma.document.findMany({
      where: { OR: [{ contentHash }, { filename }] },
      select: { id: true, filename: true, uploadedAt: true, contentHash: true },
      orderBy: { uploadedAt: 'desc' },
      take: MAX_REPORTED_VERSIONS,
    });

    return decideDuplicate(contentHash, existing);
  }

  /** Re-queues an existing document, e.g. after a failure was investigated. */
  async reprocess(documentId: string): Promise<void> {
    await this.queue.add(INGEST_JOB, { documentId }, INGEST_JOB_OPTIONS);
  }
}
