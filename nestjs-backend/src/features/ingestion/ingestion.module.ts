import { Module } from '@nestjs/common';
import { AiModule } from '@infrastructure/ai/ai.module';
import { ChunkingModule } from '@infrastructure/chunking/chunking.module';
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
  imports: [StorageModule, AiModule, ChunkingModule, VectorStoreModule, GraphModule],
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
