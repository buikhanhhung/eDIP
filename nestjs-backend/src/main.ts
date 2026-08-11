import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import type { EnvConfig } from '@config/env.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService<EnvConfig, true>);

  /**
   * Any localhost port in development, an explicit list in production.
   *
   * Vite takes the next free port when its default is busy, so a second dev
   * server — or one left running from an earlier session — lands the browser on
   * 5174 and every request fails CORS. Pinning one port turns an ordinary
   * collision into an error that reads like a bug in the app.
   *
   * The allowance is deliberately limited to loopback: another machine on the
   * network still cannot call this API from a browser.
   */
  const isProduction = config.get('NODE_ENV', { infer: true }) === 'production';
  app.enableCors({
    origin: isProduction
      ? [config.get('WEB_ORIGIN', { infer: true })]
      : /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
    credentials: true,
  });

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  new Logger('Bootstrap').log(`eDIP API listening on http://localhost:${port}`);
}

void bootstrap();
