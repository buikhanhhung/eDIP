import { Module } from '@nestjs/common';
import { GeminiEmbeddingService } from './gemini-embedding.service';
import { GeminiLlmService } from './gemini-llm.service';
import { GeminiVisionService } from './gemini-vision.service';

/**
 * Exports the concrete services. Which provider the application uses is
 * decided in `AiModule`.
 */
@Module({
  providers: [GeminiEmbeddingService, GeminiLlmService, GeminiVisionService],
  exports: [GeminiEmbeddingService, GeminiLlmService, GeminiVisionService],
})
export class GeminiModule {}
