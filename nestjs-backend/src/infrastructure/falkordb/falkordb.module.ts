import { Module } from '@nestjs/common';
import { FALKORDB_CLIENT } from './falkordb.di-token';
import { FalkorDbService } from './falkordb.service';

@Module({
  providers: [FalkorDbService, { provide: FALKORDB_CLIENT, useExisting: FalkorDbService }],
  exports: [FALKORDB_CLIENT, FalkorDbService],
})
export class FalkorDbModule {}
