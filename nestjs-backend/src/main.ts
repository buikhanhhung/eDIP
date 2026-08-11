import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import type { EnvConfig } from '@config/env.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService<EnvConfig, true>);

  // Vite dev server. Tightened before anything is deployed.
  app.enableCors({ origin: ['http://localhost:5173'], credentials: true });

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  new Logger('Bootstrap').log(`eDIP API listening on http://localhost:${port}`);
}

void bootstrap();
