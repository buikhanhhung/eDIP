import { Module } from '@nestjs/common';
import { BedrockModule } from '@infrastructure/bedrock/bedrock.module';
import { StorageModule } from '@infrastructure/storage/storage.module';
import { VectorStoreModule } from '@infrastructure/vector-store/vector-store.module';
import { IngestConsumer } from './ingest.consumer';
import { IngestionController } from './ingestion.controller';
import { IngestionService } from './ingestion.service';
import { DocumentAnalysisService } from './services/document-analysis.service';
import { TextExtractionService } from './services/text-extraction.service';

@Module({
  imports: [StorageModule, BedrockModule, VectorStoreModule],
  controllers: [IngestionController],
  providers: [IngestionService, IngestConsumer, TextExtractionService, DocumentAnalysisService],
  exports: [IngestionService],
})
export class IngestionModule {}
