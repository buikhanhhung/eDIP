import { Module } from '@nestjs/common';
import { EncryptionService } from '@common/crypto/encryption.service';
import { IngestionModule } from '@features/ingestion/ingestion.module';
import { ConnectorsController } from './connectors.controller';
import { GoogleDriveService } from './google-drive.service';

/**
 * Imports rather than re-implements the ingest path: a file pulled from Drive
 * goes through the same allowlist, duplicate check and queue as one dropped on
 * the upload page.
 */
@Module({
  imports: [IngestionModule],
  controllers: [ConnectorsController],
  providers: [GoogleDriveService, EncryptionService],
})
export class ConnectorsModule {}
