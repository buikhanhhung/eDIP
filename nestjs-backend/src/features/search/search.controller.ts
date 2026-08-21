import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { Audit } from '@common/decorators/audit.decorator';
import { RequirePermission } from '@common/rbac/rbac.decorators';
import { SearchService } from './search.service';

const searchSchema = z.object({
  q: z.string().min(1).max(500),
  /**
   * Per-query knobs. Bounds are enforced by `resolveSearchOptions`, which
   * clamps rather than rejects — a caller asking for more than the server gives
   * is answered with the most it gives, and a request that sends none of these
   * behaves exactly as it did before they existed.
   */
  resultLimit: z.number().optional(),
  laneLimit: z.number().optional(),
  snippetRadius: z.number().optional(),
  lanes: z.enum(['both', 'vector', 'lexical']).optional(),
});

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
    return this.search.search(body.q, {
      resultLimit: body.resultLimit,
      laneLimit: body.laneLimit,
      snippetRadius: body.snippetRadius,
      lanes: body.lanes,
    });
  }
}
