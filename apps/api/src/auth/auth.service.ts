import type {
  ChangePasswordRequest,
  LoginRequest,
  MeResponse,
  ResetPasswordRequest,
  SignupRequest,
} from '@lamp/domain';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
// Value imports, not `import type`: Nest resolves the constructor parameters from their classes.
import { ConfigService } from '@nestjs/config';
import { ApiException } from '../common/errors.js';
import type { Env } from '../config/env.js';
import { Prisma, type User } from '../generated/prisma/client.js';
import { MailService } from '../mail/mail.service.js';
import { resetPassword, verifyEmail } from '../mail/templates.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthErrorCode } from './auth.errors.js';
import { EmailTokensService } from './email-tokens.service.js';
import { LoginLockout } from './login-lockout.js';
import { hashPassword, isCommonPassword, verifyPassword } from './passwords.js';
import { type NewSession, SessionsService } from './sessions.service.js';

/** The wait between verification emails, matching the "Send it again" button. */
export const RESEND_COOLDOWN_MS = 60 * 1000;

export interface SignedIn {
  me: MeResponse;
  session: NewSession;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly signupEnabled: boolean;
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
    private readonly emailTokens: EmailTokensService,
    private readonly mail: MailService,
    private readonly lockout: LoginLockout,
    config: ConfigService<Env, true>,
  ) {
    this.signupEnabled = config.get('SIGNUP_ENABLED', { infer: true });
    this.appUrl = config.get('APP_URL', { infer: true });
  }

  /**
   * Creates the account, signs it in and sends the verification email. If the email can't be
   * sent, the account still stands: the user asks for it again from "Check your email".
   */
  async signup(body: SignupRequest, userAgent: string | undefined): Promise<SignedIn> {
    if (!this.signupEnabled) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        AuthErrorCode.SIGNUP_DISABLED,
        'Sign-up is turned off on this server',
      );
    }
    assertNotCommon(body.password);
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
    const session = await this.sessions.create(user.id, userAgent);
    await this.sendVerification(user).catch((error: unknown) => {
      this.logger.error(error, 'Sign-up: the verification email was not sent');
    });
    return { me: toMe(user), session };
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

  /** "Send it again" on "Check your email": at most once a minute. */
  async resendVerification(user: User): Promise<void> {
    if (user.emailVerifiedAt) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        AuthErrorCode.ALREADY_VERIFIED,
        'This email is already verified',
      );
    }
    const last = await this.emailTokens.lastIssuedAt(user.id, 'verify');
    const wait = last ? last.getTime() + RESEND_COOLDOWN_MS - Date.now() : 0;
    if (wait > 0) {
      throw new ApiException(
        HttpStatus.TOO_MANY_REQUESTS,
        AuthErrorCode.RESEND_TOO_SOON,
        'A verification email was just sent; wait a minute',
        { retryAfterSeconds: Math.ceil(wait / 1000) },
      );
    }
    await this.sendVerification(user);
  }

  /** Works from any device, signed in or not: the link is the proof. */
  async verifyEmail(token: string): Promise<void> {
    const verified = await this.prisma.$transaction(async (tx) => {
      const userId = await this.emailTokens.consume(tx, token, 'verify');
      if (!userId) return false;
      await tx.user.updateMany({
        where: { id: userId, emailVerifiedAt: null },
        data: { emailVerifiedAt: new Date() },
      });
      return true;
    });
    if (!verified) throw invalidToken();
  }

  /**
   * Sends a reset link if an active account has this email. The answer is the same either way,
   * so the endpoint can't be used to find out who has an account.
   */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.disabledAt) return;
    try {
      const token = await this.emailTokens.issue(user.id, 'reset');
      await this.mail.send(user.email, resetPassword(this.link('/reset-password', token)));
    } catch (error) {
      this.logger.error(error, 'Forgot password: the reset email was not sent');
    }
  }

  /**
   * Sets the new password and ends every session of the account (§7.2). Following the link also
   * proves the address, so it counts as verified, and it lifts a login lockout ("wait 15
   * minutes, or reset your password").
   */
  async resetPassword(body: ResetPasswordRequest): Promise<void> {
    assertNotCommon(body.password);
    const passwordHash = await hashPassword(body.password);
    const user = await this.prisma.$transaction(async (tx) => {
      const userId = await this.emailTokens.consume(tx, body.token, 'reset');
      if (!userId) return undefined;
      const current = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      await tx.session.deleteMany({ where: { userId } });
      return tx.user.update({
        where: { id: userId },
        data: { passwordHash, emailVerifiedAt: current.emailVerifiedAt ?? new Date() },
      });
    });
    if (!user) throw invalidToken();
    this.lockout.recordSuccess(user.email);
  }

  /**
   * Sets a new password for a signed-in user and ends every other session (§7.2). The session
   * that asked stays signed in.
   */
  async changePassword(user: User, sessionId: string, body: ChangePasswordRequest): Promise<void> {
    await this.confirmPassword(user, body.currentPassword);
    assertNotCommon(body.newPassword);
    const passwordHash = await hashPassword(body.newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
      this.prisma.session.deleteMany({ where: { userId: user.id, id: { not: sessionId } } }),
    ]);
  }

  /**
   * Asks a signed-in user for their password again, before a change that a stolen session must
   * not be able to make. Wrong answers count towards the login lockout for the account's email,
   * so a session can't be used to guess the password either.
   */
  async confirmPassword(user: User, password: string): Promise<void> {
    const lockedFor = this.lockout.lockedFor(user.email);
    if (lockedFor > 0) throw locked(lockedFor);
    if (!(await verifyPassword(user.passwordHash, password))) {
      this.lockout.recordFailure(user.email);
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        AuthErrorCode.WRONG_PASSWORD,
        'That is not your current password',
      );
    }
    this.lockout.recordSuccess(user.email);
  }

  private async sendVerification(user: User): Promise<void> {
    const token = await this.emailTokens.issue(user.id, 'verify');
    await this.mail.send(user.email, verifyEmail(this.link('/verify-email', token)));
  }

  private link(path: string, token: string): string {
    return `${this.appUrl}${path}?token=${token}`;
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

function assertNotCommon(password: string): void {
  if (isCommonPassword(password)) {
    throw new ApiException(
      HttpStatus.BAD_REQUEST,
      AuthErrorCode.PASSWORD_TOO_COMMON,
      'That password is too common; choose another',
    );
  }
}

function invalidToken(): ApiException {
  return new ApiException(
    HttpStatus.BAD_REQUEST,
    AuthErrorCode.TOKEN_INVALID,
    'This link has expired or was already used',
  );
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
