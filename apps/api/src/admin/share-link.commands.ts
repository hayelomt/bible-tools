import { Injectable } from '@nestjs/common';
import { Command, CommandRunner } from 'nest-commander';
import { hashToken } from '../auth/tokens.js';
// Value imports, not `import type`: Nest resolves the constructor parameters from their classes.
import { PrismaService } from '../prisma/prisma.service.js';
import { isShareToken } from '../share/share-token.js';
import { CliError } from './cli-error.js';

/**
 * `share-link:revoke <address>`: turns off a shared page someone reported (docs/OPERATIONS.md),
 * as its owner's Revoke does. Takes the address or the token alone; prints whose link it was.
 */
@Injectable()
@Command({
  name: 'share-link:revoke',
  arguments: '<address>',
  description: 'Turn off a share link, given its address (…/s/<token>) or token.',
})
export class ShareLinkRevokeCommand extends CommandRunner {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async run([address = '']: string[]): Promise<void> {
    const token = /\/s\/([^/?#]+)/.exec(address)?.[1] ?? address.trim();
    if (!isShareToken(token)) throw new CliError('That is not a share link’s address');
    const link = await this.prisma.shareLink.findFirst({
      where: { tokenHash: hashToken(token) },
      include: { user: { select: { email: true } } },
    });
    if (!link) throw new CliError('No share link has that address');
    const what = `the ${link.targetType} link of ${link.user.email}`;
    if (link.revokedAt) {
      console.log(`${capitalise(what)} was already revoked.`);
      return;
    }
    await this.prisma.shareLink.update({
      where: { id: link.id },
      data: { revokedAt: new Date() },
    });
    console.log(`Revoked ${what}.`);
  }
}

const capitalise = (text: string): string => text[0]!.toUpperCase() + text.slice(1);
