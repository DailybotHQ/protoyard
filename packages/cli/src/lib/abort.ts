import { AsyncLocalStorage } from 'node:async_hooks';
import { CliError } from './output.ts';

/**
 * Cancellation for in-process CLI runs (the MCP server runs commands with
 * `runCli`, not as a child process). A caller runs an operation inside
 * {@link runWithAbortSignal}; everything that operation starts in the same
 * async context sees the signal, without threading it through every
 * command's options:
 *
 * - `run()` (lib/process.ts), which spawns every child process (`pnpm
 *   install`, git, provider CLIs), refuses to start one once the signal is
 *   aborted and kills a running one when it aborts;
 * - long or irreversible steps call {@link throwIfAborted} first (installing
 *   dependencies, recording a promotion, each screenshot).
 *
 * Outside a scope there is no signal and nothing changes.
 */

const scope = new AsyncLocalStorage<AbortSignal>();

/** Runs `operation` with `signal` as the ambient cancellation signal. */
export function runWithAbortSignal<T>(
  signal: AbortSignal,
  operation: () => Promise<T>
): Promise<T> {
  return scope.run(signal, operation);
}

/** The ambient cancellation signal, or undefined outside a scope. */
export function currentAbortSignal(): AbortSignal | undefined {
  return scope.getStore();
}

/** Throws a `failure` CliError when the ambient signal is aborted. */
export function throwIfAborted(step: string): void {
  if (scope.getStore()?.aborted) {
    throw new CliError('failure', `Cancelled before ${step}: the operation was aborted.`, {
      hint: 'The caller stopped waiting (for example an MCP timeout); nothing more was done.',
    });
  }
}
