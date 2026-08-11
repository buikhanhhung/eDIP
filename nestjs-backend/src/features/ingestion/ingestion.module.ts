import { Module } from '@nestjs/common';
import { BedrockModule } from '@infrastructure/bedrock/bedrock.module';
import { StorageModule } from '@infrastructure/storage/storage.module';
import { VectorStoreModule } from '@infrastructure/vector-store/vector-store.module';
import { GraphModule } from '@features/graph/graph.module';
import { IngestConsumer } from './ingest.consumer';
import { IngestionController } from './ingestion.controller';
import { IngestionService } from './ingestion.service';
import { DocumentAnalysisService } from './services/document-analysis.service';
import { EntityExtractionService } from './services/entity-extraction.service';
import { TextExtractionService } from './services/text-extraction.service';

@Module({
  imports: [StorageModule, BedrockModule, VectorStoreModule, GraphModule],
  controllers: [IngestionController],
  providers: [
    IngestionService,
    IngestConsumer,
    TextExtractionService,
    DocumentAnalysisService,
    EntityExtractionService,
  ],
  exports: [IngestionService],
})
export class IngestionModule {}
