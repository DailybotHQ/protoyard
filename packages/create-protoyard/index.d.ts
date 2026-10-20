export type CreateErrorCode = 'usage' | 'unsafe_path' | 'not_found' | 'conflict' | 'failure';

export declare class CreateError extends Error {
  readonly code: CreateErrorCode;
  readonly hint: string | undefined;
  /** Same mapping as the protoyard CLI: usage/unsafe_path 2, not_found 3, else 1. */
  readonly exitCode: number;
  constructor(code: CreateErrorCode, message: string, hint?: string);
}

export interface CreateOptions {
  /** The folder to create (relative to `cwd`); must not exist or be empty. */
  dir: string | undefined;
  cwd?: string;
  /** Starter template (default `blank`). */
  template?: string;
  /** Default: the package manager that ran `create` (npm_config_user_agent), else pnpm. */
  pm?: 'pnpm' | 'npm';
  /** false: skip `<pm> install` (no network). */
  install?: boolean;
  /** false: skip `git init`. */
  git?: boolean;
  /** Reserved hook: report how to install the agent skill (nothing is installed). */
  skill?: boolean;
  /** Pipe the install output instead of inheriting it (for --json). */
  quiet?: boolean;
  /** The protoyard CLI bin to run `new` with (tests); default: the installed one. */
  cliBin?: string;
}

export interface StepResult {
  skipped: boolean;
  ok: boolean;
  error?: string;
}

export interface CreateResult {
  dir: string;
  name: string;
  version: string;
  pm: 'pnpm' | 'npm';
  template: string;
  prototype: { slug: string; path: string; created: unknown };
  /** Every file written, relative to `dir`. */
  files: string[];
  install: StepResult;
  git: StepResult;
  skill: { requested: boolean; installed: false; next?: string };
  /** Commands to run next. */
  next: string[];
}

export declare const VERSION: string;
export declare const STARTER_SLUG: string;
export declare const DEFAULT_TEMPLATE: string;
export declare function packageNameFor(folder: string): string | null;
export declare function detectPackageManager(userAgent?: string): 'pnpm' | 'npm';
export declare function isInside(parent: string, child: string): boolean;
export declare function checkTarget(
  dir: string | undefined,
  cwd: string
): { target: string; exists: boolean };
export declare function workspaceFiles(input: {
  name: string;
  pm: 'pnpm' | 'npm';
  template: string;
}): Record<string, string | object>;
export declare function createWorkspace(options: CreateOptions): CreateResult;
export declare function parseArgs(argv: readonly string[]): ParsedArgs;
export declare function main(argv?: readonly string[]): Promise<number>;

export interface ParsedArgs {
  dir: string | undefined;
  template?: string;
  pm?: 'pnpm' | 'npm';
  install: boolean;
  git: boolean;
  yes: boolean;
  json: boolean;
  skill: boolean;
  help: boolean;
  version: boolean;
}
