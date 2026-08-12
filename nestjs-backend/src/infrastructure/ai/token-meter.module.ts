import { Global, Module } from '@nestjs/common';
import { TokenMeterService } from './token-meter.service';

/**
 * Global for the same reason `DatabaseModule` is: every provider adapter meters
 * its own calls, and those adapters live in three sibling modules that
 * `AiModule` imports. Exporting this from `AiModule` instead would make the
 * adapters depend on the module that selects between them.
 */
@Global()
@Module({
  providers: [TokenMeterService],
  exports: [TokenMeterService],
})
export class TokenMeterModule {}
