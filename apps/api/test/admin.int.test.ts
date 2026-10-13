import { Test } from '@nestjs/testing';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CliError } from '../src/admin/cli-error.js';
import { CliModule } from '../src/admin/cli.module.js';
import { PasswordInput } from '../src/admin/password-input.js';
import {
  UserCreateCommand,
  UserDisableCommand,
  UserEnableCommand,
  UserVerifyCommand,
} from '../src/admin/user.commands.js';
import { verifyPassword } from '../src/auth/passwords.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { type TestApp, createTestApp } from './int/app.js';
import { truncateAll } from './int/db.js';
import { type Client, createClient } from './int/http.js';

const PASSWORD = 'a lamp to my feet';

let t: TestApp;
let client: Client;
let prisma: PrismaService;
let password = PASSWORD;
const readPassword = vi.fn<PasswordInput['read']>(async () => password);
let commands: {
  create: UserCreateCommand;
  disable: UserDisableCommand;
  enable: UserEnableCommand;
  verify: UserVerifyCommand;
};
let output: string[];

beforeAll(async () => {
  // The API too, to check the commands' effect on signing in.
  t = await createTestApp();
  const cli = await Test.createTestingModule({ imports: [CliModule] })
    .overrideProvider(PasswordInput)
    .useValue({ read: readPassword })
    .compile();
  await cli.init();
  prisma = cli.get(PrismaService);
  commands = {
    create: cli.get(UserCreateCommand),
    disable: cli.get(UserDisableCommand),
    enable: cli.get(UserEnableCommand),
    verify: cli.get(UserVerifyCommand),
  };
  return () => cli.close();
});

afterAll(async () => {
  await t.app.close();
});

beforeEach(async () => {
  await truncateAll(prisma);
  client = await createClient(t);
  password = PASSWORD;
  readPassword.mockClear();
  output = [];
  vi.spyOn(console, 'log').mockImplementation((line: string) => void output.push(line));
});

afterEach(() => {
  vi.restoreAllMocks();
});

const login = (email: string) => client.post('/api/auth/login', { email, password: PASSWORD });

async function signUp(email: string): Promise<string> {
  const res = await client.post('/api/auth/signup', { email, password: PASSWORD }).expect(201);
  return (res.body as { id: string }).id;
}

describe('user:create', () => {
  it('creates a verified user that can sign in', async () => {
    await commands.create.run([' Reader@Example.com ']);
    expect(output).toEqual(['Created Reader@Example.com (user, verified).']);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'reader@example.com' } });
    expect(user).toMatchObject({ email: 'Reader@Example.com', role: 'user', disabledAt: null });
    expect(user.emailVerifiedAt).toBeInstanceOf(Date);
    await expect(verifyPassword(user.passwordHash, PASSWORD)).resolves.toBe(true);
    const res = await login('reader@example.com').expect(200);
    expect(res.body).toMatchObject({ role: 'user', emailVerifiedAt: expect.any(String) });
  });

  it('creates an admin with --role admin', async () => {
    await commands.create.run(['admin@example.com'], { role: 'admin' });
    await expect(
      prisma.user.findUniqueOrThrow({ where: { email: 'admin@example.com' } }),
    ).resolves.toMatchObject({ role: 'admin' });
  });

  it('refuses an unknown role before asking for the password', async () => {
    await expect(commands.create.run(['reader@example.com'], { role: 'root' })).rejects.toThrow(
      new CliError('--role must be one of: user, admin'),
    );
    expect(readPassword).not.toHaveBeenCalled();
    await expect(prisma.user.count()).resolves.toBe(0);
  });

  it('refuses an email that is taken, in any case', async () => {
    await signUp('reader@example.com');
    await expect(commands.create.run(['READER@example.com'])).rejects.toThrow(
      new CliError('An account with the email READER@example.com already exists'),
    );
    await expect(prisma.user.count()).resolves.toBe(1);
  });

  it.each([
    ['an invalid email', 'not-an-email', PASSWORD, /^email: /],
    ['a short password', 'reader@example.com', 'short', /^password: /],
    ['a common password', 'reader@example.com', 'qwertyuiop', /too common/],
  ])('refuses %s', async (_, email, given, message) => {
    password = given;
    await expect(commands.create.run([email])).rejects.toThrow(message);
    await expect(prisma.user.count()).resolves.toBe(0);
  });
});

describe('user:disable and user:enable', () => {
  it('signs the account out everywhere and stops new sign-ins, until enabled', async () => {
    await signUp('reader@example.com');
    await login('reader@example.com').expect(200);

    await commands.disable.run(['READER@example.com']);
    expect(output).toEqual(['Disabled reader@example.com; signed out 2 sessions.']);
    await expect(prisma.session.count()).resolves.toBe(0);
    expect((await login('reader@example.com').expect(403)).body.errorCode).toBe('ACCOUNT_DISABLED');

    await commands.disable.run(['reader@example.com']);
    expect(output.at(-1)).toBe('reader@example.com was already disabled.');

    await commands.enable.run(['reader@example.com']);
    expect(output.at(-1)).toBe('Enabled reader@example.com.');
    await login('reader@example.com').expect(200);
    await commands.enable.run(['reader@example.com']);
    expect(output.at(-1)).toBe('reader@example.com is not disabled.');
  });

  it('leaves the data and other accounts alone', async () => {
    const userId = await signUp('reader@example.com');
    await signUp('other@example.com');
    await prisma.lesson.create({ data: { userId, title: 'Lesson', date: new Date() } });
    await commands.disable.run(['reader@example.com']);
    await expect(prisma.lesson.count({ where: { userId } })).resolves.toBe(1);
    await expect(prisma.session.count()).resolves.toBe(1);
  });
});

describe('user:verify', () => {
  it('marks the email verified, once', async () => {
    const userId = await signUp('reader@example.com');
    await commands.verify.run(['reader@example.com']);
    expect(output).toEqual(['Verified reader@example.com.']);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.emailVerifiedAt).toBeInstanceOf(Date);

    await commands.verify.run(['reader@example.com']);
    expect(output.at(-1)).toBe('reader@example.com was already verified.');
    await expect(prisma.user.findUniqueOrThrow({ where: { id: userId } })).resolves.toMatchObject({
      emailVerifiedAt: user.emailVerifiedAt,
    });
  });
});

it.each([
  ['user:disable', () => commands.disable],
  ['user:enable', () => commands.enable],
  ['user:verify', () => commands.verify],
])('%s names an unknown email', async (_, command) => {
  await expect(command().run(['nobody@example.com'])).rejects.toThrow(
    new CliError('No account has the email nobody@example.com'),
  );
});
