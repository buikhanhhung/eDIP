import { Module } from '@nestjs/common';
import { BedrockEmbeddingService } from './bedrock-embedding.service';
import { BedrockLlmService } from './bedrock-llm.service';
import { BedrockVisionService } from './bedrock-vision.service';

/**
 * Written rather than copied: ECVBot's module pulls in a provider-integrations
 * module and a LangChain build it ships a pnpm patch for, none of which this
 * app has or needs.
 */
@Module({
  providers: [BedrockEmbeddingService, BedrockLlmService, BedrockVisionService],
  exports: [BedrockEmbeddingService, BedrockLlmService, BedrockVisionService],
})
export class BedrockModule {}
