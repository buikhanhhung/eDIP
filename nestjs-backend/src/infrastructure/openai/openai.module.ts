import { Module } from '@nestjs/common';
import { OpenAiEmbeddingService } from './openai-embedding.service';
import { OpenAiLlmService } from './openai-llm.service';
import { OpenAiVisionService } from './openai-vision.service';

/**
 * Exports the concrete services. Which provider the application actually uses
 * is decided in `AiModule`, not here — this module only makes the OpenAI
 * implementations available to it.
 */
@Module({
  providers: [OpenAiEmbeddingService, OpenAiLlmService, OpenAiVisionService],
  exports: [OpenAiEmbeddingService, OpenAiLlmService, OpenAiVisionService],
})
export class OpenAiModule {}
