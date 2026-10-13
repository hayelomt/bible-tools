import {
  type LoginRequest,
  type MeResponse,
  type SignupRequest,
  loginRequestSchema,
  signupRequestSchema,
} from '@lamp/domain';
import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { User } from '../generated/prisma/client.js';
import { CurrentUser, Public } from './auth.decorators.js';
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

  private signIn(res: Response, { me, session }: SignedIn): MeResponse {
    this.sessions.setCookie(res, session.token, session.expiresAt);
    return me;
  }
}
