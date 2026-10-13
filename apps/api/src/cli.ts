import { CommandFactory } from 'nest-commander';
import { CliError } from './admin/cli-error.js';
import { CliModule } from './admin/cli.module.js';
import { appVersion } from './version.js';

// The admin CLI: `node dist/cli.js <command>`, or `pnpm cli <command>` in development (README).
await CommandFactory.run(CliModule, {
  version: appVersion,
  logger: ['warn', 'error'],
  serviceErrorHandler: (error) => {
    console.error(error instanceof CliError ? error.message : error);
    process.exitCode = 1;
  },
});
