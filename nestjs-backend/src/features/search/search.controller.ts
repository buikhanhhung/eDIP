import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { Audit } from '@common/decorators/audit.decorator';
import { RequirePermission } from '@common/rbac/rbac.decorators';
import { SearchService } from './search.service';

const searchSchema = z.object({ q: z.string().min(1).max(500) });

class SearchDto extends createZodDto(searchSchema) {}

@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  /** Tighter than the global limit: the vector lane spends Bedrock quota. */
  @Audit('search.query')
  @RequirePermission('search')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post()
  query(@Body() body: SearchDto) {
    return this.search.search(body.q);
  }
}
