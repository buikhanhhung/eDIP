import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';

const MAX_TAKE = 200;

/**
 * Read side of the audit trail. Writing is the interceptor's job, so there is
 * no method here that could be called to fabricate an entry.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async list(take = 50, skip = 0) {
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: Math.min(take, MAX_TAKE),
        skip,
        select: {
          id: true,
          action: true,
          targetType: true,
          targetId: true,
          meta: true,
          createdAt: true,
          actor: { select: { id: true, email: true, role: true } },
        },
      }),
      this.prisma.auditLog.count(),
    ]);

    return { items, total };
  }
}
