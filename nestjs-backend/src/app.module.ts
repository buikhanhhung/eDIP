import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { HttpExceptionFilter } from '@common/filters/http-exception.filter';
import { PrismaExceptionFilter } from '@common/filters/prisma-exception.filter';
import CustomZodValidationPipe from '@common/pipes/custom-zod-validation.pipe';
import { RbacGuard } from '@common/rbac/rbac.guard';
import { type EnvConfig, validateEnv } from '@config/env.config';
import { AuditInterceptor } from '@common/interceptors/audit.interceptor';
import { TokenMeterModule } from '@infrastructure/ai/token-meter.module';
import { AskModule } from '@features/ask/ask.module';
import { AuditModule } from '@features/audit/audit.module';
import { AuthModule } from '@features/auth/auth.module';
import { DocumentsModule } from '@features/documents/documents.module';
import { GraphModule } from '@features/graph/graph.module';
import { ConnectorsModule } from '@features/connectors/connectors.module';
import { IngestionModule } from '@features/ingestion/ingestion.module';
import { SearchModule } from '@features/search/search.module';
import { QueueModule } from '@shared/queue/queue.module';
import { SharedModule } from '@shared/shared.module';

/**
 * Written from scratch rather than copied from ECVBot. ECVBot's root module
 * wires fifteen feature modules, Restate, CLS, cache-manager and an
 * AuthenticationGuard whose dependency chain (ApiKeyGuard -> TokenService ->
 * RefreshTokenRepository -> prisma.refreshToken) has no counterpart here.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      cache: true,
      envFilePath: ['.env'],
    }),

    // Baseline limiter. /auth/login tightens this per-handler via @Throttle,
    // and the Bedrock-backed routes will do the same — quota is shared.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 60 }]),

    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvConfig, true>) => ({
        secret: config.get('JWT_SECRET', { infer: true }),
        signOptions: { expiresIn: config.get('JWT_EXPIRES_IN', { infer: true }) },
      }),
    }),

    SharedModule,
    // Global, so every provider adapter can meter its own calls without the
    // module that selects between them being in the dependency chain.
    TokenMeterModule,
    QueueModule,
    AuthModule,
    DocumentsModule,
    IngestionModule,
    ConnectorsModule,
    SearchModule,
    AskModule,
    GraphModule,
    AuditModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: CustomZodValidationPipe },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: RbacGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
