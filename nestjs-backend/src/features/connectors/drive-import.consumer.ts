import { Processor, WorkerHost } from '@nestjs/bullmq';
import { BadRequestException, ConflictException, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { IngestionService } from '@features/ingestion/ingestion.service';
import { QUEUE_NAMES } from '@shared/queue/queue.constants';
import { GoogleDriveService } from './google-drive.service';

export interface DriveImportJobData {
  ownerId: string;
  file: { id: string; name: string; mimeType: string };
}

/**
 * Pulls one file out of Drive and hands it to the ordinary upload path.
 *
 * Queued rather than done inside the import request: selecting a folder can
 * mean ninety files, and ninety Drive downloads inside one HTTP call is a
 * request that times out holding ninety files' worth of memory. Here each file
 * is its own unit of work, and the library fills in as they land.
 *
 * Concurrency is low on purpose. Every file that arrives queues an ingest
 * behind it, and that pipeline spends AI quota — pulling faster than it can
 * read only builds a backlog.
 */
@Processor(QUEUE_NAMES.DRIVE_IMPORT, { concurrency: 2 })
export class DriveImportConsumer extends WorkerHost {
  private readonly logger = new Logger(DriveImportConsumer.name);

  constructor(
    private readonly drive: GoogleDriveService,
    private readonly ingestion: IngestionService,
  ) {
    super();
  }

  async process(job: Job<DriveImportJobData>): Promise<void> {
    const { ownerId, file } = job.data;

    let bytes: Buffer;
    let filename: string;
    try {
      ({ filename, bytes } = await this.drive.fetchFile(ownerId, file));
    } catch (failure) {
      // Drive refusing a file is an answer, not a fault to retry into: the
      // sharing was revoked, or it is a format with nothing to download.
      if (failure instanceof BadRequestException) {
        this.logger.warn(`skipped ${file.name}: ${failure.message}`);
        return;
      }
      throw failure;
    }

    try {
      await this.ingestion.upload(
        { originalname: filename, buffer: bytes, size: bytes.length },
        ownerId,
        'google_drive',
      );
    } catch (failure) {
      // Both of these are settled outcomes. Rethrowing would spend the retry
      // budget re-deciding something that cannot change: the bytes are already
      // in the library, or the extension is one the pipeline will never read.
      if (failure instanceof ConflictException) {
        this.logger.log(`${filename} is already in the library`);
        return;
      }
      if (failure instanceof BadRequestException) {
        this.logger.warn(`${filename} was refused: ${failure.message}`);
        return;
      }
      throw failure;
    }
  }
}
