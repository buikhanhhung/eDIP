import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { tap, type Observable } from 'rxjs';
import { AUDIT_KEY } from '@common/decorators/audit.decorator';
import type { AuthUser } from '@common/rbac/rbac.decorators';
import { PrismaService } from '@shared/database/prisma.service';

/** Query text is worth keeping; a whole document body is not. */
const MAX_META_LENGTH = 500;

/**
 * Writes an audit row after a decorated handler succeeds.
 *
 * The write is fired without being awaited and its failure is swallowed: an
 * audit trail is a record of the work, never a precondition for it. A failing
 * log must not turn a successful upload into an error the user sees.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const action = this.reflector.getAllAndOverride<string | undefined>(AUDIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!action) return next.handle();

    const request = context.switchToHttp().getRequest<
      Request & { user?: AuthUser | null; params: Record<string, string>; body?: unknown }
    >();
    const actorId = request.user?.id ?? null;
    const paramId = request.params?.id ?? null;
    const meta = this.extractMeta(request.body);
    const startedAt = Date.now();

    return next.handle().pipe(
      tap((response: unknown) => {
        const targetId = paramId ?? this.responseId(response);
        void this.prisma.auditLog
          .create({
            data: {
              actorId,
              action,
              targetType: targetId ? 'document' : null,
              targetId,
              // How long the handler took. Recorded on every audited action,
              // which is what lets the overview report a real answer time for
              // search and ask rather than an estimate.
              meta: { ...meta, durationMs: Date.now() - startedAt },
            },
          })
          .catch((error: unknown) => {
            this.logger.warn(`could not record ${action}: ${(error as Error).message}`);
          });
      }),
    );
  }

  private responseId(response: unknown): string | null {
    if (response && typeof response === 'object' && 'id' in response) {
      const id = (response as { id: unknown }).id;
      return typeof id === 'string' ? id : null;
    }
    return null;
  }

  /** Only the query text — never the document body, which can be megabytes. */
  private extractMeta(body: unknown): { q: string } | Record<string, never> {
    if (body && typeof body === 'object' && 'q' in body) {
      const q = (body as { q: unknown }).q;
      if (typeof q === 'string') return { q: q.slice(0, MAX_META_LENGTH) };
    }
    return {};
  }
}
