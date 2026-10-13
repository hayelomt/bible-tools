import { Injectable } from '@nestjs/common';
// Value imports, not `import type`: Nest resolves the constructor parameters from their classes.
import { AuthService } from '../auth/auth.service.js';
import type { User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  /**
   * Deletes the account once the password is confirmed (§12). Every row the user owns, sessions
   * included, references the user with `ON DELETE CASCADE`, so the one statement removes them
   * all atomically.
   */
  async delete(user: User, password: string): Promise<void> {
    await this.auth.confirmPassword(user, password);
    await this.prisma.user.deleteMany({ where: { id: user.id } });
  }
}
