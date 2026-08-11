import { Logger, Module, type Provider, type Type } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '@config/env.config';
import { BedrockEmbeddingService } from '@infrastructure/bedrock/bedrock-embedding.service';
import { BedrockLlmService } from '@infrastructure/bedrock/bedrock-llm.service';
import { BedrockVisionService } from '@infrastructure/bedrock/bedrock-vision.service';
import { BedrockModule } from '@infrastructure/bedrock/bedrock.module';
import { GeminiEmbeddingService } from '@infrastructure/gemini/gemini-embedding.service';
import { GeminiLlmService } from '@infrastructure/gemini/gemini-llm.service';
import { GeminiVisionService } from '@infrastructure/gemini/gemini-vision.service';
import { GeminiModule } from '@infrastructure/gemini/gemini.module';
import { OpenAiEmbeddingService } from '@infrastructure/openai/openai-embedding.service';
import { OpenAiLlmService } from '@infrastructure/openai/openai-llm.service';
import { OpenAiVisionService } from '@infrastructure/openai/openai-vision.service';
import { OpenAiModule } from '@infrastructure/openai/openai.module';
import { EMBEDDING_SERVICE, LLM_SERVICE, VISION_SERVICE } from './ai.di-token';
import type { IEmbeddingService, ILlmService, IVisionService } from './ai.port';

/**
 * Binds the three capability tokens to whichever provider `AI_PROVIDER` names.
 *
 * Every provider is constructed regardless of the selection: their
 * constructors do no I/O and never throw on a missing key, so the unused ones
 * cost nothing and switching provider is a restart rather than a rebuild. The
 * guard against calling an unconfigured provider lives at the call site, where
 * it can name the missing credential.
 *
 * Adding a fourth provider means one module, three services, and one row in
 * each table below.
 */
type Provider3<T> = { bedrock: T; openai: T; gemini: T };

/**
 * `T` is always given explicitly at the call site, as the capability
 * interface. Left to inference it would settle on whichever class appears
 * first and then reject the other two for not having its private fields.
 */
function bind<T>(token: symbol, implementations: Provider3<Type<T>>): Provider {
  return {
    provide: token,
    inject: [
      ConfigService,
      implementations.bedrock,
      implementations.openai,
      implementations.gemini,
    ],
    useFactory: (
      config: ConfigService<EnvConfig, true>,
      bedrock: T,
      openai: T,
      gemini: T,
    ): T => ({ bedrock, openai, gemini })[config.get('AI_PROVIDER', { infer: true })],
  };
}

@Module({
  imports: [BedrockModule, OpenAiModule, GeminiModule],
  providers: [
    {
      provide: 'AI_PROVIDER_BANNER',
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvConfig, true>) => {
        const provider = config.get('AI_PROVIDER', { infer: true });
        new Logger('AiModule').log(`AI provider: ${provider}`);
        return provider;
      },
    },
    bind<ILlmService>(LLM_SERVICE, {
      bedrock: BedrockLlmService,
      openai: OpenAiLlmService,
      gemini: GeminiLlmService,
    }),
    bind<IEmbeddingService>(EMBEDDING_SERVICE, {
      bedrock: BedrockEmbeddingService,
      openai: OpenAiEmbeddingService,
      gemini: GeminiEmbeddingService,
    }),
    bind<IVisionService>(VISION_SERVICE, {
      bedrock: BedrockVisionService,
      openai: OpenAiVisionService,
      gemini: GeminiVisionService,
    }),
  ],
  exports: [LLM_SERVICE, EMBEDDING_SERVICE, VISION_SERVICE],
})
export class AiModule {}
