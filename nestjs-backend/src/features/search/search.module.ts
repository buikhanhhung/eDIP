import { Module } from '@nestjs/common';
import { AiModule } from '@infrastructure/ai/ai.module';
import { VectorStoreModule } from '@infrastructure/vector-store/vector-store.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [AiModule, VectorStoreModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
