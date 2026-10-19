import { Injectable } from '@nestjs/common';
// Value imports, not `import type`: Nest resolves the constructor parameters from their classes.
import { AuthService } from '../auth/auth.service.js';
import type { User } from '../generated/prisma/client.js';
import { GroupsService } from '../groups/groups.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly groups: GroupsService,
  ) {}

  /**
   * Deletes the account once the password is confirmed (§12). Every row the user owns, sessions
   * included, references the user with `ON DELETE CASCADE`, so the one statement removes them
   * all atomically. It leaves its groups first, in the same transaction, so their members drop
   * what it shared and an owned group passes on (§17.12).
   */
  async delete(user: User, password: string): Promise<void> {
    await this.auth.confirmPassword(user, password);
    await this.prisma.$transaction(async (tx) => {
      await this.groups.leaveAll(user.id, tx);
      await tx.user.deleteMany({ where: { id: user.id } });
    });
  }
}
