import pc from 'picocolors';

/**
 * Every command reports through one envelope so agents can rely on a stable
 * `--json` shape: `{ ok, command, data?, error?: { code, message, hint? } }`.
 * Human output goes to stdout; diagnostics go to stderr so `--json` stdout
 * stays machine-parseable.
 */

export const ExitCode = {
  Ok: 0,
  Failure: 1,
  Usage: 2,
  NotFound: 3,
  Validation: 4,
  Provider: 5,
} as const;
export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode];

export type ErrorCode =
  | 'failure'
  | 'usage'
  | 'not_found'
  | 'validation'
  | 'provider'
  | 'auth'
  | 'conflict'
  | 'unsafe_path';

const EXIT_BY_CODE: Record<ErrorCode, ExitCodeValue> = {
  failure: ExitCode.Failure,
  usage: ExitCode.Usage,
  not_found: ExitCode.NotFound,
  validation: ExitCode.Validation,
  provider: ExitCode.Provider,
  auth: ExitCode.Provider,
  conflict: ExitCode.Failure,
  unsafe_path: ExitCode.Usage,
};

export class CliError extends Error {
  readonly code: ErrorCode;
  readonly hint: string | undefined;
  readonly exitCode: ExitCodeValue;
  /** Optional structured payload that still belongs in the JSON envelope. */
  readonly data: unknown;

  constructor(code: ErrorCode, message: string, options: { hint?: string; data?: unknown } = {}) {
    super(message);
    this.name = 'CliError';
    this.code = code;
    this.hint = options.hint;
    this.exitCode = EXIT_BY_CODE[code];
    this.data = options.data;
  }
}

export interface Envelope<T = unknown> {
  ok: boolean;
  command: string;
  data?: T;
  error?: { code: ErrorCode; message: string; hint?: string };
}

export function successEnvelope<T>(command: string, data: T): Envelope<T> {
  return { ok: true, command, data };
}

export function errorEnvelope(command: string, error: unknown): Envelope {
  const err = toCliError(error);
  const envelope: Envelope = {
    ok: false,
    command,
    error: { code: err.code, message: err.message, ...(err.hint ? { hint: err.hint } : {}) },
  };
  if (err.data !== undefined) envelope.data = err.data;
  return envelope;
}

export function toCliError(error: unknown): CliError {
  if (error instanceof CliError) return error;
  if (error instanceof Error) return new CliError('failure', error.message);
  return new CliError('failure', String(error));
}

export interface OutputOptions {
  json: boolean;
  quiet: boolean;
  color: boolean;
}

/** Writer used by commands; tests capture it instead of touching process streams. */
export interface Output {
  readonly options: OutputOptions;
  /** Human line on stdout (suppressed with --json or --quiet). */
  info(line?: string): void;
  /** Human line that survives --quiet (still suppressed with --json). */
  always(line?: string): void;
  /** Diagnostic line on stderr (suppressed with --json; never with --quiet). */
  warn(line: string): void;
  /** Raw JSON on stdout. */
  json(value: unknown): void;
  readonly c: Colors;
}

export interface Colors {
  bold(s: string): string;
  dim(s: string): string;
  green(s: string): string;
  red(s: string): string;
  yellow(s: string): string;
  cyan(s: string): string;
  magenta(s: string): string;
}

export function createColors(enabled: boolean): Colors {
  const p = pc.createColors(enabled);
  return {
    bold: p.bold,
    dim: p.dim,
    green: p.green,
    red: p.red,
    yellow: p.yellow,
    cyan: p.cyan,
    magenta: p.magenta,
  };
}

export interface Streams {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

export const processStreams: Streams = {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
};

export function createOutput(options: OutputOptions, streams: Streams = processStreams): Output {
  const c = createColors(options.color && !options.json);
  return {
    options,
    c,
    info(line = '') {
      if (!options.json && !options.quiet) streams.stdout(`${line}\n`);
    },
    always(line = '') {
      if (!options.json) streams.stdout(`${line}\n`);
    },
    warn(line) {
      if (!options.json) streams.stderr(`${line}\n`);
    },
    json(value) {
      streams.stdout(`${JSON.stringify(value, null, 2)}\n`);
    },
  };
}

/** Status glyphs that still read without color (pass/fail must not rely on hue). */
export function mark(c: Colors, status: 'pass' | 'fail' | 'warn' | 'skip'): string {
  switch (status) {
    case 'pass':
      return c.green('✓');
    case 'fail':
      return c.red('✗');
    case 'warn':
      return c.yellow('!');
    default:
      return c.dim('-');
  }
}

/** Fixed-width table for terminals; truncates long cells with an ellipsis. */
export function formatTable(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
  options: { maxWidth?: number } = {}
): string {
  const maxWidth = options.maxWidth ?? 40;
  const clip = (s: string) => (s.length > maxWidth ? `${s.slice(0, maxWidth - 1)}…` : s);
  const cells = [headers, ...rows].map((r) => r.map((cell) => clip(cell)));
  const widths = headers.map((_, i) => Math.max(...cells.map((r) => (r[i] ?? '').length)));
  const line = (r: readonly string[]) =>
    r
      .map((cell, i) => cell.padEnd(widths[i] ?? 0))
      .join('  ')
      .trimEnd();
  const [head, ...body] = cells;
  return [line(head ?? []), widths.map((w) => '─'.repeat(w)).join('  '), ...body.map(line)].join(
    '\n'
  );
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}
