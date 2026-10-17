import type { Command } from 'commander';
import {
  CliError,
  createOutput,
  ExitCode,
  errorEnvelope,
  type Output,
  type Streams,
  successEnvelope,
  toCliError,
} from './output.ts';
import { resolveWorkspaceRoot } from './paths.ts';
import { type CommandContext, createContext } from './workspace.ts';

/**
 * Glue between commander and command handlers. A handler returns data (for
 * `--json`) plus an optional human renderer; long-running commands (dev,
 * preview, control server) also return `keepAlive`, awaited after the
 * envelope is printed so agents get the URL immediately.
 */

export interface GlobalOptions {
  json?: boolean;
  yes?: boolean;
  cwd?: string;
  root?: string;
  quiet?: boolean;
  color?: boolean;
}

export interface CommandResult<T = unknown> {
  data: T;
  render?: (out: Output) => void;
  /**
   * A run that completed but failed (e.g. some validation checks failed): the
   * envelope gets `ok: false` with this error AND the data, and the human
   * renderer still runs so every check is reported.
   */
  failure?: CliError;
  keepAlive?: Promise<void>;
}

export type Handler = (
  ctx: CommandContext,
  args: string[],
  options: Record<string, unknown>
) => Promise<CommandResult>;

export interface RunnerEnv {
  streams?: Streams;
  /** Called with the final exit code (tests capture it; the bin sets process.exitCode). */
  setExitCode: (code: number) => void;
}

export function colorEnabled(options: GlobalOptions): boolean {
  if (options.color === false || process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  return Boolean(process.stdout.isTTY);
}

export function makeOutput(options: GlobalOptions, streams?: Streams): Output {
  return createOutput(
    { json: Boolean(options.json), quiet: Boolean(options.quiet), color: colorEnabled(options) },
    streams
  );
}

export function renderError(out: Output, error: CliError) {
  out.warn(`${out.c.red('✗')} ${error.message}`);
  if (error.hint) out.warn(`  ${out.c.dim(error.hint)}`);
}

/** Wraps a handler as a commander action with the shared envelope + exit codes. */
export function action(name: string, handler: Handler, env: RunnerEnv) {
  return async (...raw: unknown[]) => {
    const command = raw[raw.length - 1] as Command;
    const options = command.optsWithGlobals() as Record<string, unknown> & GlobalOptions;
    const args = (raw.slice(0, -2) as unknown[]).flatMap((a) =>
      Array.isArray(a) ? (a as string[]) : a === undefined ? [] : [String(a)]
    );
    const out = makeOutput(options, env.streams);
    let result: CommandResult;
    try {
      const root = resolveWorkspaceRoot({ root: options.root, cwd: options.cwd });
      const ctx = createContext(root, out, Boolean(options.yes));
      result = await handler(ctx, args, options);
    } catch (error) {
      const err = toCliError(error);
      if (out.options.json) out.json(errorEnvelope(name, err));
      else renderError(out, err);
      env.setExitCode(err.exitCode);
      return;
    }
    if (out.options.json) {
      out.json(
        result.failure
          ? { ...errorEnvelope(name, result.failure), data: result.data }
          : successEnvelope(name, result.data)
      );
    } else {
      result.render?.(out);
      if (result.failure) renderError(out, result.failure);
    }
    env.setExitCode(result.failure ? result.failure.exitCode : ExitCode.Ok);
    if (result.keepAlive) await result.keepAlive;
  };
}

/** Reads a string option that commander typed as unknown. */
export function opt(options: Record<string, unknown>, key: string): string | undefined {
  const value = options[key];
  return typeof value === 'string' ? value : undefined;
}

export function flag(options: Record<string, unknown>, key: string): boolean {
  return options[key] === true;
}
