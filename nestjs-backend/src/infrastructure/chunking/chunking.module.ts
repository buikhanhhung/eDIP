import { Module } from '@nestjs/common';
import { AiModule } from '@infrastructure/ai/ai.module';
import { ChunkingService } from './chunking.service';

@Module({
  // For the embedding capability the semantic strategy needs. `AiModule` does
  // not import this one, so there is no cycle.
  imports: [AiModule],
  providers: [ChunkingService],
  exports: [ChunkingService],
})
export class ChunkingModule {}
