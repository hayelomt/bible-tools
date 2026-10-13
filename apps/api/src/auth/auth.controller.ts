import {
  type ChangePasswordRequest,
  type ForgotPasswordRequest,
  changePasswordRequestSchema,
  type LoginRequest,
  type MeResponse,
  type ResetPasswordRequest,
  type SignupRequest,
  type VerifyEmailRequest,
  forgotPasswordRequestSchema,
  loginRequestSchema,
  resetPasswordRequestSchema,
  signupRequestSchema,
  verifyEmailRequestSchema,
} from '@lamp/domain';
import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { Session, User } from '../generated/prisma/client.js';
import { CurrentSession, CurrentUser, Public } from './auth.decorators.js';
// Value imports, not `import type`: Nest resolves the constructor parameters from their classes.
import { AuthService, type SignedIn, toMe } from './auth.service.js';
import { SessionsService, readSessionToken } from './sessions.service.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionsService,
  ) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('signup')
  async signup(
    @Body({ schema: signupRequestSchema }) body: SignupRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeResponse> {
    return this.signIn(res, await this.auth.signup(body, req.headers['user-agent']));
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('login')
  @HttpCode(200)
  async login(
    @Body({ schema: loginRequestSchema }) body: LoginRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeResponse> {
    return this.signIn(res, await this.auth.login(body, req.headers['user-agent']));
  }

  /** Ends this session only; the notes on the device stay (§6.6). Fine without a session. */
  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const token = readSessionToken(req);
    if (token) await this.sessions.end(token);
    this.sessions.clearCookie(res);
  }

  @Get('me')
  me(@CurrentUser() user: User): MeResponse {
    return toMe(user);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('verify-email')
  @HttpCode(204)
  async verifyEmail(
    @Body({ schema: verifyEmailRequestSchema }) body: VerifyEmailRequest,
  ): Promise<void> {
    await this.auth.verifyEmail(body.token);
  }

  /** For the signed-in user, so the address comes from the session and the body is empty. */
  @UseGuards(ThrottlerGuard)
  @Post('resend-verification')
  @HttpCode(204)
  async resendVerification(@CurrentUser() user: User): Promise<void> {
    await this.auth.resendVerification(user);
  }

  /** 204 whether or not the account exists. */
  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('forgot-password')
  @HttpCode(204)
  async forgotPassword(
    @Body({ schema: forgotPasswordRequestSchema }) body: ForgotPasswordRequest,
  ): Promise<void> {
    await this.auth.forgotPassword(body.email);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('reset-password')
  @HttpCode(204)
  async resetPassword(
    @Body({ schema: resetPasswordRequestSchema }) body: ResetPasswordRequest,
  ): Promise<void> {
    await this.auth.resetPassword(body);
  }

  /** Keeps this session and ends the others. Throttled like login: it checks a password. */
  @UseGuards(ThrottlerGuard)
  @Post('change-password')
  @HttpCode(204)
  async changePassword(
    @Body({ schema: changePasswordRequestSchema }) body: ChangePasswordRequest,
    @CurrentUser() user: User,
    @CurrentSession() session: Session,
  ): Promise<void> {
    await this.auth.changePassword(user, session.id, body);
  }

  private signIn(res: Response, { me, session }: SignedIn): MeResponse {
    this.sessions.setCookie(res, session.token, session.expiresAt);
    return me;
  }
}
