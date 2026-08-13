import { Controller, Get, Query } from '@nestjs/common';
import { RequirePermission } from '@common/rbac/rbac.decorators';
import { resolveRange } from '@features/documents/overview-range';
import { AuditService } from './audit.service';

/** The query string as it arrives, before the window and the numbers resolve. */
interface AuditListParams {
  from?: string;
  to?: string;
  category?: string;
  action?: string;
  actorId?: string;
  q?: string;
  take?: string;
  skip?: string;
}

@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  /** Admin only, enforced here rather than by hiding the nav link. */
  @RequirePermission('audit')
  @Get()
  list(@Query() params: AuditListParams) {
    return this.audit.list({
      // An unparseable date in a bookmarked URL falls back to the default
      // window rather than erroring, as it does on the overview.
      range: resolveRange(params.from, params.to),
      category: params.category,
      action: params.action,
      actorId: params.actorId,
      q: params.q,
      take: params.take ? Number(params.take) : undefined,
      skip: params.skip ? Number(params.skip) : undefined,
    });
  }

  /**
   * The window's headline figures, and the values worth offering as filters.
   *
   * Kept apart from the list so the tiles are not refetched on every keystroke
   * in the search box, and so they keep describing the whole window while the
   * table below them is narrowed.
   */
  @RequirePermission('audit')
  @Get('summary')
  summary(@Query('from') from?: string, @Query('to') to?: string) {
    return this.audit.summary(resolveRange(from, to));
  }
}
