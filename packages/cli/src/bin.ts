#!/usr/bin/env node
import { runCli } from './program.ts';

// Long-running commands (dev, preview, gallery) resolve only on shutdown, so
// exiting here is always safe and stops stray handles from keeping Node alive.
// A pipe is written asynchronously: exiting before stdout drains cut --json
// envelopes at 64 KB, so exit only once both streams have flushed.
function flushThenExit(code: number): void {
  let pending = 2;
  const done = () => {
    pending -= 1;
    if (pending === 0) process.exit(code);
  };
  process.stdout.write('', done);
  process.stderr.write('', done);
}

runCli(process.argv.slice(2), {
  setExitCode: (code) => {
    process.exitCode = code;
  },
})
  .then(() => flushThenExit(Number(process.exitCode ?? 0)))
  .catch((error: unknown) => {
    process.stderr.write(
      `protoyard: unexpected error: ${(error as Error).stack ?? String(error)}\n`
    );
    process.exit(1);
  });
