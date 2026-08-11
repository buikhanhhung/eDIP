import { Global, Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { LoggerModule } from './logger/logger.module';

/**
 * Deliberately smaller than ECVBot's SharedModule, which also pulls Redis,
 * BullMQ, verification codes and feature flags. Queue support arrives with the
 * ingestion pipeline; everything else here is unused by this project.
 */
const sharedModules = [DatabaseModule, LoggerModule];

@Global()
@Module({
  imports: sharedModules,
  exports: sharedModules,
})
export class SharedModule {}
