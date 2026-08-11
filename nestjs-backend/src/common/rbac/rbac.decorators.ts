import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Permission, Role } from './permissions';

export const PERMISSION_KEY = 'edip:permission';
export const PUBLIC_KEY = 'edip:public';

/** Every route needs one of these, or @Public. RbacGuard denies otherwise. */
export const RequirePermission = (permission: Permission) =>
  SetMetadata(PERMISSION_KEY, permission);

/** Opt a route out of the permission check entirely (login, health). */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | null =>
    ctx.switchToHttp().getRequest().user ?? null,
);
