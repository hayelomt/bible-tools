import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { envFilePaths, envSchema } from '../config/env.js';
import { GroupsService } from '../groups/groups.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { NewPasswordQuestions, PasswordInput } from './password-input.js';
import { ShareLinkRevokeCommand } from './share-link.commands.js';
import {
  UserCreateCommand,
  UserDeleteCommand,
  UserDisableCommand,
  UserEnableCommand,
  UserVerifyCommand,
} from './user.commands.js';

/** The admin CLI (`src/cli.ts`): the same config and database as the API, without HTTP. */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: envFilePaths(),
      validationSchema: envSchema,
    }),
    PrismaModule,
  ],
  providers: [
    // The service alone: the group controllers' rate limits need the HTTP app's throttler.
    GroupsService,
    NewPasswordQuestions,
    PasswordInput,
    ShareLinkRevokeCommand,
    UserCreateCommand,
    UserDeleteCommand,
    UserDisableCommand,
    UserEnableCommand,
    UserVerifyCommand,
  ],
})
export class CliModule {}
