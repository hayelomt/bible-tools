import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { envFilePaths, envSchema } from '../config/env.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { NewPasswordQuestions, PasswordInput } from './password-input.js';
import {
  UserCreateCommand,
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
    NewPasswordQuestions,
    PasswordInput,
    UserCreateCommand,
    UserDisableCommand,
    UserEnableCommand,
    UserVerifyCommand,
  ],
})
export class CliModule {}
