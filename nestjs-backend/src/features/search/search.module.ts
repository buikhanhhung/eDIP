import { Module } from '@nestjs/common';
import { BedrockModule } from '@infrastructure/bedrock/bedrock.module';
import { VectorStoreModule } from '@infrastructure/vector-store/vector-store.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [BedrockModule, VectorStoreModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
