import { USER_ROLES, signupRequestSchema } from '@lamp/domain';
import { Injectable } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { isCommonPassword, hashPassword } from '../auth/passwords.js';
import { Prisma, type User } from '../generated/prisma/client.js';
import { GroupsService } from '../groups/groups.service.js';
// Value imports, not `import type`: Nest resolves the constructor parameters from their classes.
import { PrismaService } from '../prisma/prisma.service.js';
import { CliError } from './cli-error.js';
import { PasswordInput } from './password-input.js';

type Role = (typeof USER_ROLES)[number];

/**
 * Admin commands for accounts (§7.1). Each takes the account's email, in any case. Decorated so
 * that the constructor's parameter types are emitted for the subclasses that inherit it.
 */
@Injectable()
abstract class UserCommand extends CommandRunner {
  constructor(protected readonly prisma: PrismaService) {
    super();
  }

  protected async findUser(email: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim() } });
    if (!user) throw new CliError(`No account has the email ${email.trim()}`);
    return user;
  }
}

@Command({
  name: 'user:create',
  arguments: '<email>',
  description:
    'Create an account, verified, even with sign-up turned off. The password is asked for, or read from stdin.',
})
export class UserCreateCommand extends UserCommand {
  constructor(
    prisma: PrismaService,
    private readonly passwords: PasswordInput,
  ) {
    super(prisma);
  }

  async run([email = '']: string[], options: { role?: string } = {}): Promise<void> {
    const role = options.role ?? 'user';
    // nest-commander lists the choices in the help but doesn't enforce them.
    if (!isRole(role)) throw new CliError(`--role must be one of: ${USER_ROLES.join(', ')}`);
    const parsed = signupRequestSchema.safeParse({ email, password: await this.passwords.read() });
    if (!parsed.success) {
      throw new CliError(
        parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n'),
      );
    }
    if (isCommonPassword(parsed.data.password)) {
      throw new CliError('That password is too common; choose another');
    }
    try {
      await this.prisma.user.create({
        data: {
          email: parsed.data.email,
          passwordHash: await hashPassword(parsed.data.password),
          // The admin vouches for the address, so no verification email is needed.
          emailVerifiedAt: new Date(),
          role,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new CliError(`An account with the email ${parsed.data.email} already exists`);
      }
      throw error;
    }
    console.log(`Created ${parsed.data.email} (${role}, verified).`);
  }

  @Option({
    flags: '--role <role>',
    description: 'the role of the account (default: user)',
    choices: [...USER_ROLES],
  })
  parseRole(value: string): string {
    return value;
  }
}

@Command({
  name: 'user:disable',
  arguments: '<email>',
  description:
    'Stop an account from signing in, sign out all its devices and take it out of its groups. Its data stays.',
})
export class UserDisableCommand extends UserCommand {
  constructor(
    prisma: PrismaService,
    private readonly groups: GroupsService,
  ) {
    super(prisma);
  }

  async run([email = '']: string[]): Promise<void> {
    const user = await this.findUser(email);
    if (user.disabledAt) {
      console.log(`${user.email} was already disabled.`);
      return;
    }
    // Its posts leave every group at once, and a group it owns passes on (§17.12).
    const left = await this.prisma.$transaction(async (tx) => {
      const memberships = await tx.groupMember.count({ where: { userId: user.id } });
      await this.groups.leaveAll(user.id, tx);
      await tx.user.update({ where: { id: user.id }, data: { disabledAt: new Date() } });
      const ended = await tx.session.deleteMany({ where: { userId: user.id } });
      return { sessions: ended.count, groups: memberships };
    });
    console.log(
      `Disabled ${user.email}; signed out ${plural(left.sessions, 'session')}` +
        (left.groups > 0 ? `; left ${plural(left.groups, 'group')}.` : '.'),
    );
  }
}

@Command({
  name: 'user:enable',
  arguments: '<email>',
  description: 'Let a disabled account sign in again.',
})
export class UserEnableCommand extends UserCommand {
  async run([email = '']: string[]): Promise<void> {
    const user = await this.findUser(email);
    if (!user.disabledAt) {
      console.log(`${user.email} is not disabled.`);
      return;
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { disabledAt: null } });
    console.log(`Enabled ${user.email}.`);
  }
}

@Command({
  name: 'user:verify',
  arguments: '<email>',
  description: 'Mark the email of an account verified, without the link (it can then sync).',
})
export class UserVerifyCommand extends UserCommand {
  async run([email = '']: string[]): Promise<void> {
    const user = await this.findUser(email);
    if (user.emailVerifiedAt) {
      console.log(`${user.email} was already verified.`);
      return;
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date() },
    });
    console.log(`Verified ${user.email}.`);
  }
}

@Command({
  name: 'user:delete',
  arguments: '<email>',
  description:
    'Delete an account and every row it owns, as Delete account in the app does (a deletion request). Needs --yes.',
})
export class UserDeleteCommand extends UserCommand {
  constructor(
    prisma: PrismaService,
    private readonly groups: GroupsService,
  ) {
    super(prisma);
  }

  async run([email = '']: string[], options: { yes?: boolean } = {}): Promise<void> {
    const user = await this.findUser(email);
    if (!options.yes) {
      throw new CliError(
        `This deletes ${user.email} and all its notes, for good. Run it again with --yes.`,
      );
    }
    // Every table with a user_id cascades from the user, as for Delete account (§7.2), after it
    // leaves its groups (§17.12).
    await this.prisma.$transaction(async (tx) => {
      await this.groups.leaveAll(user.id, tx);
      await tx.user.deleteMany({ where: { id: user.id } });
    });
    console.log(`Deleted ${user.email} and all its data.`);
  }

  @Option({ flags: '--yes', description: 'confirm the deletion' })
  parseYes(): boolean {
    return true;
  }
}

function isRole(value: string): value is Role {
  return (USER_ROLES as readonly string[]).includes(value);
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}
