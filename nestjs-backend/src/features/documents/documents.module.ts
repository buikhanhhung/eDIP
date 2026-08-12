import { Module } from '@nestjs/common';
import { StorageModule } from '@infrastructure/storage/storage.module';
import { GraphModule } from '@features/graph/graph.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { OverviewStatsService } from './overview-stats.service';

@Module({
  imports: [StorageModule, GraphModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, OverviewStatsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
