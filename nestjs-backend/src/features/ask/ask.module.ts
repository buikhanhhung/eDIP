import { Module } from '@nestjs/common';
import { AiModule } from '@infrastructure/ai/ai.module';
import { VectorStoreModule } from '@infrastructure/vector-store/vector-store.module';
import { AskController } from './ask.controller';
import { AskService } from './ask.service';

@Module({
  imports: [AiModule, VectorStoreModule],
  controllers: [AskController],
  providers: [AskService],
})
export class AskModule {}
