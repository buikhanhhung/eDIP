import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@shared/database/prisma.service';
import * as bcrypt from 'bcrypt';
import type { EnvConfig } from '@config/env.config';
import type { Role } from '@common/rbac/permissions';

/**
 * A bcrypt hash of a value nobody knows. Compared against when the email is not
 * found so that the unknown-email path costs the same as the wrong-password
 * path. Returning the same message is not enough on its own — an attacker can
 * tell the two apart by timing if one path skips the hash comparison.
 */
const DUMMY_HASH = '$2b$10$CwTycUXWue0Thq9StjUM0uJ8.CkQoZ7ByVufxHcVjfBHDFYAZBqZa';

export interface LoginResult {
  accessToken: string;
  user: { id: string; email: string; role: Role };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async login(email: string, password: string): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({ where: { email } });

    const matches = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

    // Same exception object for "no such user" and "wrong password": an error
    // that distinguishes them turns the login form into an account enumerator.
    if (!user || !matches) {
      throw new UnauthorizedException('Email or password is incorrect');
    }

    const payload = { sub: user.id, email: user.email, role: user.role };
    return {
      accessToken: await this.jwt.signAsync(payload, {
        secret: this.config.get('JWT_SECRET', { infer: true }),
        expiresIn: this.config.get('JWT_EXPIRES_IN', { infer: true }),
      }),
      user: { id: user.id, email: user.email, role: user.role as Role },
    };
  }
}
