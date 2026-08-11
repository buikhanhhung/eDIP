import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '@config/env.config';
import { BedrockEmbeddingService } from '@infrastructure/bedrock/bedrock-embedding.service';
import { BedrockLlmService } from '@infrastructure/bedrock/bedrock-llm.service';
import { BedrockVisionService } from '@infrastructure/bedrock/bedrock-vision.service';
import { BedrockModule } from '@infrastructure/bedrock/bedrock.module';
import { OpenAiEmbeddingService } from '@infrastructure/openai/openai-embedding.service';
import { OpenAiLlmService } from '@infrastructure/openai/openai-llm.service';
import { OpenAiVisionService } from '@infrastructure/openai/openai-vision.service';
import { OpenAiModule } from '@infrastructure/openai/openai.module';
import { EMBEDDING_SERVICE, LLM_SERVICE, VISION_SERVICE } from './ai.di-token';

/**
 * Binds the three capability tokens to whichever provider `AI_PROVIDER` names.
 *
 * Both provider modules are constructed either way. That is deliberate: their
 * constructors do no I/O and never throw on a missing key, so the unused one
 * costs nothing, and switching provider is a restart rather than a rebuild.
 * The guard against calling an unconfigured provider lives at the call site,
 * where it can say which credential is missing.
 */
@Module({
  imports: [BedrockModule, OpenAiModule],
  providers: [
    {
      provide: LLM_SERVICE,
      inject: [ConfigService, BedrockLlmService, OpenAiLlmService],
      useFactory: (
        config: ConfigService<EnvConfig, true>,
        bedrock: BedrockLlmService,
        openai: OpenAiLlmService,
      ) => {
        const provider = config.get('AI_PROVIDER', { infer: true });
        new Logger('AiModule').log(`AI provider: ${provider}`);
        return provider === 'openai' ? openai : bedrock;
      },
    },
    {
      provide: EMBEDDING_SERVICE,
      inject: [ConfigService, BedrockEmbeddingService, OpenAiEmbeddingService],
      useFactory: (
        config: ConfigService<EnvConfig, true>,
        bedrock: BedrockEmbeddingService,
        openai: OpenAiEmbeddingService,
      ) => (config.get('AI_PROVIDER', { infer: true }) === 'openai' ? openai : bedrock),
    },
    {
      provide: VISION_SERVICE,
      inject: [ConfigService, BedrockVisionService, OpenAiVisionService],
      useFactory: (
        config: ConfigService<EnvConfig, true>,
        bedrock: BedrockVisionService,
        openai: OpenAiVisionService,
      ) => (config.get('AI_PROVIDER', { infer: true }) === 'openai' ? openai : bedrock),
    },
  ],
  exports: [LLM_SERVICE, EMBEDDING_SERVICE, VISION_SERVICE],
})
export class AiModule {}
