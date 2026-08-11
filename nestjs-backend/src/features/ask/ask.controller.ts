import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { Audit } from '@common/decorators/audit.decorator';
import { RequirePermission } from '@common/rbac/rbac.decorators';
import { AskService } from './ask.service';

const askSchema = z.object({ q: z.string().min(1).max(1000) });

class AskDto extends createZodDto(askSchema) {}

@Controller('ask')
export class AskController {
  constructor(private readonly ask: AskService) {}

  /** Lower than /search: every call spends both embedding and LLM quota. */
  @Audit('ask.query')
  @RequirePermission('ask')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post()
  question(@Body() body: AskDto) {
    return this.ask.ask(body.q);
  }
}
