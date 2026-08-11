import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { CurrentUser, Public, type AuthUser } from '@common/rbac/rbac.decorators';
import { PERMISSIONS } from '@common/rbac/permissions';
import { AuthService } from './auth.service';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

class LoginDto extends createZodDto(loginSchema) {}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** 10 attempts per 15 minutes, matching the limit eDIP v1 shipped. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 900_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() body: LoginDto) {
    return this.auth.login(body.email, body.password);
  }

  /**
   * Who am I, and what may I do. The one route besides login that answers
   * without a token, so the client can tell "session expired" from "forbidden"
   * and send the visitor to the login screen instead of retrying into a 403.
   */
  @Public()
  @Get('me')
  me(@CurrentUser() user: AuthUser | null) {
    if (!user) return { user: null, role: null, permissions: [] };
    return { user, role: user.role, permissions: PERMISSIONS[user.role] };
  }
}
