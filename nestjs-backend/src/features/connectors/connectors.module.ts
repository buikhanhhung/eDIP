import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { EncryptionService } from '@common/crypto/encryption.service';
import { IngestionModule } from '@features/ingestion/ingestion.module';
import { QUEUE_NAMES } from '@shared/queue/queue.constants';
import { ConnectorsController } from './connectors.controller';
import { DriveImportConsumer } from './drive-import.consumer';
import { GoogleDriveService } from './google-drive.service';

/**
 * Imports rather than re-implements the ingest path: a file pulled from Drive
 * goes through the same allowlist, duplicate check and queue as one dropped on
 * the upload page.
 *
 * The queue registered here is only for fetching the bytes out of Drive. Once
 * a file has landed it joins the ordinary ingest queue like any other upload.
 */
@Module({
  imports: [IngestionModule, BullModule.registerQueue({ name: QUEUE_NAMES.DRIVE_IMPORT })],
  controllers: [ConnectorsController],
  providers: [GoogleDriveService, EncryptionService, DriveImportConsumer],
})
export class ConnectorsModule {}
