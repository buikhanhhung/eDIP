import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PERMISSION_KEY, PUBLIC_KEY, type AuthUser } from './rbac.decorators';
import { can, type Permission, type Role } from './permissions';

/**
 * Single global guard doing two jobs, in this order:
 *
 *   1. Decode the bearer token if one is present. Every route outside @Public
 *      needs one: the app opens on a login screen and nothing is readable
 *      before signing in. A missing or invalid token is refused with 403, not
 *      401, so a denied anonymous call and a denied under-privileged call are
 *      indistinguishable to a client probing the API.
 *
 *   2. Check the permission declared by @RequirePermission. A route that
 *      declares nothing is DENIED. Failing closed here is deliberate: eDIP v1
 *      shipped three fail-open holes (a self-service role endpoint, an admin
 *      default role, a client-asserted role cookie) and all three came from
 *      "no rule declared" meaning "allow".
 */
@Injectable()
export class RbacGuard implements CanActivate {
  private readonly logger = new Logger(RbacGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser | null }>();

    request.user = this.resolveUser(request);

    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const permission = this.reflector.getAllAndOverride<Permission | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!permission) {
      this.logger.error(
        `${context.getClass().name}.${context.getHandler().name} declares no @RequirePermission — denying.`,
      );
      throw new ForbiddenException('Route is not authorised for any role');
    }

    if (!request.user) {
      throw new ForbiddenException('Sign in to use this endpoint');
    }

    const role: Role = request.user.role;
    if (!can(role, permission)) {
      throw new ForbiddenException(`Role "${role}" is not allowed to ${permission}`);
    }
    return true;
  }

  /** Never throws: a bad token is indistinguishable from no token. */
  private resolveUser(request: Request): AuthUser | null {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) return null;
    try {
      const payload = this.jwt.verify<{ sub: string; email: string; role: Role }>(
        header.slice(7),
      );
      return { id: payload.sub, email: payload.email, role: payload.role };
    } catch {
      return null;
    }
  }
}
