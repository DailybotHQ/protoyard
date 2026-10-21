import { type ChildProcess, spawn } from 'node:child_process';
import { constants, existsSync, readFileSync } from 'node:fs';
import { access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { delimiter, dirname, join } from 'node:path';
import { currentAbortSignal } from './abort.ts';

/**
 * Child processes are always spawned with an argv array and `shell: false`:
 * slugs, paths and project names never pass through a shell, so they cannot
 * be interpreted as shell syntax.
 */

export interface RunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** `inherit` streams to the terminal; `pipe` captures (default). */
  stdio?: 'pipe' | 'inherit';
  timeoutMs?: number;
  input?: string;
  /** Kills the child when aborted; defaults to the ambient signal (lib/abort.ts). */
  signal?: AbortSignal;
}

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
  /** True when the binary could not be started at all (ENOENT etc.). */
  spawnError?: string;
  timedOut?: boolean;
  /** True when the run was cancelled: never started, or killed when the signal aborted. */
  aborted?: boolean;
}

export function run(command: string, args: readonly string[], options: RunOptions = {}) {
  return new Promise<RunResult>((resolvePromise) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let aborted = false;
    const signal = options.signal ?? currentAbortSignal();
    if (signal?.aborted) {
      resolvePromise({ code: 130, stdout, stderr, spawnError: 'aborted', aborted: true });
      return;
    }
    let child: ChildProcess;
    try {
      child = spawn(command, [...args], {
        cwd: options.cwd,
        env: options.env ?? process.env,
        shell: false,
        stdio: options.stdio === 'inherit' ? 'inherit' : ['pipe', 'pipe', 'pipe'],
      });
    } catch (error) {
      resolvePromise({ code: 127, stdout, stderr, spawnError: (error as Error).message });
      return;
    }
    const timer = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill('SIGTERM');
        }, options.timeoutMs)
      : undefined;
    const onAbort = () => {
      aborted = true;
      child.kill('SIGTERM');
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    if (options.input !== undefined) child.stdin?.end(options.input);
    else child.stdin?.end();
    child.on('error', (error) => {
      if (timer) clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      resolvePromise({ code: 127, stdout, stderr, spawnError: error.message });
    });
    child.on('close', (code, exitSignal) => {
      if (timer) clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      resolvePromise({
        code: code ?? (exitSignal ? 128 : 1),
        stdout,
        stderr,
        ...(timedOut ? { timedOut } : {}),
        ...(aborted ? { aborted } : {}),
      });
    });
  });
}

/** Finds an executable on PATH without running it (no shell, no `which`). */
export async function which(binary: string): Promise<string | null> {
  const dirs = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
  const exts =
    process.platform === 'win32' ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';') : [''];
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = join(dir, binary + ext);
      try {
        await access(candidate, constants.X_OK);
        return candidate;
      } catch {
        // keep looking
      }
    }
  }
  return null;
}

/**
 * Resolves a package's JavaScript bin entry so it can run as
 * `node <file>`, independent of PATH and of pnpm's `.bin` shims.
 */
export function resolvePackageBin(
  packageName: string,
  binName: string,
  fromDirs: readonly string[]
): string | null {
  for (const from of fromDirs) {
    try {
      const require = createRequire(join(from, 'noop.js'));
      const pkgJsonPath = require.resolve(`${packageName}/package.json`);
      const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as {
        bin?: string | Record<string, string>;
      };
      const rel = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.[binName];
      if (!rel) continue;
      const file = join(dirname(pkgJsonPath), rel);
      if (existsSync(file)) return file;
    } catch {
      // try the next base directory
    }
  }
  return null;
}

/** Strips ANSI escapes so provider output can be parsed and logged plainly. */
export function stripAnsi(text: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escapes start with ESC
  return text.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '');
}
