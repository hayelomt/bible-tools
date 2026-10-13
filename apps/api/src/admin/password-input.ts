import { Injectable } from '@nestjs/common';
// Value imports, not `import type`: Nest resolves the constructor parameters from their classes.
import { InquirerService, Question, QuestionSet } from 'nest-commander';
import { CliError } from './cli-error.js';

const NEW_PASSWORD = 'new-password';

interface NewPasswordAnswers {
  password: string;
  again: string;
}

@QuestionSet({ name: NEW_PASSWORD })
export class NewPasswordQuestions {
  @Question({ type: 'password', name: 'password', message: 'Password:', mask: '*' })
  parsePassword(value: string): string {
    return value;
  }

  @Question({ type: 'password', name: 'again', message: 'Password again:', mask: '*' })
  parseAgain(value: string): string {
    return value;
  }
}

/**
 * A new password, never from the command line (it would stay in the shell history). Asked twice
 * at a terminal; otherwise the first line of stdin, for scripts.
 */
@Injectable()
export class PasswordInput {
  constructor(private readonly inquirer: InquirerService) {}

  async read(): Promise<string> {
    if (!process.stdin.isTTY) return firstLine(process.stdin);
    const answers = await this.inquirer.ask<NewPasswordAnswers>(NEW_PASSWORD, undefined);
    if (answers.password !== answers.again) throw new CliError('The passwords do not match');
    return answers.password;
  }
}

async function firstLine(stream: NodeJS.ReadableStream): Promise<string> {
  let text = '';
  for await (const chunk of stream) {
    text += String(chunk);
    if (text.includes('\n')) break;
  }
  return text.split(/\r?\n/)[0] ?? '';
}
