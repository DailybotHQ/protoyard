#!/usr/bin/env node
import { runCli } from './program.ts';

// Long-running commands (dev, preview, gallery) resolve only on shutdown, so
// exiting here is always safe and stops stray handles from keeping Node alive.
runCli(process.argv.slice(2), {
  setExitCode: (code) => {
    process.exitCode = code;
  },
})
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error: unknown) => {
    process.stderr.write(
      `protoyard: unexpected error: ${(error as Error).stack ?? String(error)}\n`
    );
    process.exit(1);
  });
