/** A refusal the CLI prints as one line, without a stack trace, before exiting with 1. */
export class CliError extends Error {
  override readonly name = 'CliError';
}
