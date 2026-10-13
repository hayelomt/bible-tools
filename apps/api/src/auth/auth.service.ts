import type { LoginRequest, MeResponse, SignupRequest } from '@lamp/domain';
import { HttpStatus, Injectable } from '@nestjs/common';
// Value imports, not `import type`: Nest resolves the constructor parameters from their classes.
import { ConfigService } from '@nestjs/config';
import { ApiException } from '../common/errors.js';
import type { Env } from '../config/env.js';
import { Prisma, type User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthErrorCode } from './auth.errors.js';
import { LoginLockout } from './login-lockout.js';
import { hashPassword, isCommonPassword, verifyPassword } from './passwords.js';
import { type NewSession, SessionsService } from './sessions.service.js';

export interface SignedIn {
  me: MeResponse;
  session: NewSession;
}

@Injectable()
export class AuthService {
  private readonly signupEnabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
    private readonly lockout: LoginLockout,
    config: ConfigService<Env, true>,
  ) {
    this.signupEnabled = config.get('SIGNUP_ENABLED', { infer: true });
  }

  /** Creates the account and signs it in. The email is verified later (M3-02). */
  async signup(body: SignupRequest, userAgent: string | undefined): Promise<SignedIn> {
    if (!this.signupEnabled) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        AuthErrorCode.SIGNUP_DISABLED,
        'Sign-up is turned off on this server',
      );
    }
    if (isCommonPassword(body.password)) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        AuthErrorCode.PASSWORD_TOO_COMMON,
        'That password is too common; choose another',
      );
    }
    const passwordHash = await hashPassword(body.password);
    let user: User;
    try {
      user = await this.prisma.user.create({ data: { email: body.email, passwordHash } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ApiException(
          HttpStatus.CONFLICT,
          AuthErrorCode.EMAIL_TAKEN,
          'An account with this email already exists',
        );
      }
      throw error;
    }
    return { me: toMe(user), session: await this.sessions.create(user.id, userAgent) };
  }

  async login(body: LoginRequest, userAgent: string | undefined): Promise<SignedIn> {
    const lockedFor = this.lockout.lockedFor(body.email);
    if (lockedFor > 0) throw locked(lockedFor);

    const user = await this.prisma.user.findUnique({ where: { email: body.email } });
    if (!(await verifyPassword(user?.passwordHash ?? null, body.password)) || !user) {
      this.lockout.recordFailure(body.email);
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        AuthErrorCode.INVALID_CREDENTIALS,
        'Wrong email or password',
      );
    }
    this.lockout.recordSuccess(body.email);
    if (user.disabledAt) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        AuthErrorCode.ACCOUNT_DISABLED,
        'This account has been disabled',
      );
    }
    return { me: toMe(user), session: await this.sessions.create(user.id, userAgent) };
  }
}

export function toMe(user: User): MeResponse {
  return {
    id: user.id,
    email: user.email,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    role: user.role as MeResponse['role'],
  };
}

function locked(ms: number): ApiException {
  const retryAfterSeconds = Math.ceil(ms / 1000);
  return new ApiException(
    HttpStatus.TOO_MANY_REQUESTS,
    AuthErrorCode.ACCOUNT_LOCKED,
    'Too many failed sign-ins; try again later',
    { retryAfterSeconds },
  );
}
