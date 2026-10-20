#!/usr/bin/env node
// `protoyard` (unscoped): hand over to @protoyard/cli in this same process,
// so argv, stdin/stdout/stderr, signals and the exit code are the CLI's own.
import { pathToFileURL } from 'node:url';
import { resolveCliBin } from '../index.js';

let bin;
try {
  bin = resolveCliBin();
} catch (error) {
  process.stderr.write(`protoyard: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
await import(pathToFileURL(bin).href);
