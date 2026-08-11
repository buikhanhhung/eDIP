import { Controller, Get, Query } from '@nestjs/common';
import { RequirePermission } from '@common/rbac/rbac.decorators';
import { AuditService } from './audit.service';

@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  /** Admin only, enforced here rather than by hiding the nav link. */
  @RequirePermission('audit')
  @Get()
  list(@Query('take') take?: string, @Query('skip') skip?: string) {
    return this.audit.list(take ? Number(take) : undefined, skip ? Number(skip) : undefined);
  }
}
