import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { decodeMultipartFilename } from '@common/text/decode-multipart-filename';
import { allowedTypeFor, rejectionMessage } from '@infrastructure/storage/allowlist';
import { LocalStorageService } from '@infrastructure/storage/local-storage.service';
import { PrismaService } from '@shared/database/prisma.service';
import { INGEST_JOB, INGEST_JOB_OPTIONS, QUEUE_NAMES } from '@shared/queue/queue.constants';
import type { IngestJobData } from './ingest.consumer';

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

  async upload(file: UploadedFile, ownerId: string) {
    const filename = decodeMultipartFilename(file.originalname);

    // Extension decides the type. `file.mimetype` is the client's
    // Content-Type header and is never consulted.
    const allowed = allowedTypeFor(filename);
    if (!allowed) throw new BadRequestException(rejectionMessage(filename));

    const storagePath = await this.storage.save(file.buffer, filename);

    const document = await this.prisma.document.create({
      data: {
        filename,
        mimeType: allowed.mime,
        sizeBytes: file.size,
        storagePath,
        ownerId,
        status: 'uploaded',
      },
      select: { id: true, filename: true, status: true, uploadedAt: true },
    });

    await this.queue.add(INGEST_JOB, { documentId: document.id }, INGEST_JOB_OPTIONS);
    this.logger.log(`queued ingest for ${document.id} (${filename})`);

    return document;
  }

  /** Re-queues an existing document, e.g. after a failure was investigated. */
  async reprocess(documentId: string): Promise<void> {
    await this.queue.add(INGEST_JOB, { documentId }, INGEST_JOB_OPTIONS);
  }
}
