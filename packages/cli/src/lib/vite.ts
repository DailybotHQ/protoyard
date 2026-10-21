import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CliError } from './output.ts';
import { resolvePackageBin } from './process.ts';

/**
 * Prototypes are built and served by Vite in a child process, one prototype
 * per process, through the prototype's OWN `vite.config.ts`. That is what
 * keeps a build scoped: Vite only follows imports reachable from that
 * prototype's `index.html`.
 */

export const VITE_CONFIG_FILES = ['vite.config.ts', 'vite.config.js', 'vite.config.mjs'];

export function findViteConfig(dir: string): string | null {
  for (const name of VITE_CONFIG_FILES) {
    const file = join(dir, name);
    if (existsSync(file)) return file;
  }
  return null;
}

/** Prefers the Vite the prototype resolves (its renderer's), else the CLI's own. */
export function resolveViteBin(prototypeDir: string, root: string): string {
  const cliPackageDir = fileURLToPath(new URL('../..', import.meta.url));
  const bin = resolvePackageBin('vite', 'vite', [prototypeDir, root, cliPackageDir]);
  if (!bin) {
    throw new CliError('not_found', 'Vite is not installed.', { hint: 'Run `pnpm install`.' });
  }
  return bin;
}

/**
 * Vite loads `vite.config.ts` and the workspace packages it imports (which
 * ship TypeScript source) through Node. Node's built-in type stripping rejects
 * some TS syntax (parameter properties, enums), so Vite runs with tsx's loader
 * registered: every TS module then loads the same way it does in tests.
 */
export function nodeLoaderArgs(prototypeDir: string, root: string): string[] {
  // Packed CLI dependencies are compiled to JavaScript, and Vite uses Node's
  // built-in stripping for the user's erasable vite.config.ts. Keep tsx only
  // for this source-mode monorepo CLI, whose workspace dependencies are TS.
  if (import.meta.url.endsWith('.js')) return [];
  const cliPackageDir = fileURLToPath(new URL('../..', import.meta.url));
  for (const from of [prototypeDir, root, cliPackageDir]) {
    try {
      const loader = createRequire(join(from, 'noop.js')).resolve('tsx/esm');
      return ['--import', pathToFileURL(loader).href];
    } catch {
      // try the next base
    }
  }
  return [];
}

/** Normalizes a public base: `./` (relocatable) or an absolute `/sub/path/`. */
export function normalizeBase(base: string | undefined, fallback = './'): string {
  const value = (base ?? fallback).trim();
  if (value === '' || value === '.' || value === './') return './';
  if (!value.startsWith('/') || value.includes('..') || /[\s?#]/.test(value)) {
    throw new CliError('usage', `Invalid --base "${value}".`, {
      hint: 'Use "./" for relocatable output or an absolute path such as "/protoyard/crm-demo/".',
    });
  }
  return value.endsWith('/') ? value : `${value}/`;
}

export interface ViteBuildOptions {
  dir: string;
  root: string;
  outDir: string;
  base: string;
  includeDevtools: boolean;
  /** Ask the renderer config to add the offline service worker (PROTOYARD_OFFLINE=1). */
  offline?: boolean;
  /**
   * Storage namespace baked into the build instead of the manifest's
   * (PROTOYARD_STORAGE_NAMESPACE; template demos use `template-demo-<name>`).
   */
  storageNamespace?: string;
  /** Keep an explicit shell frame when embedded (PROTOYARD_FRAME_WHEN_EMBEDDED; the artifact target). */
  frameWhenEmbedded?: boolean;
  /**
   * Serve avatar images from this shared folder instead of emitting a copy
   * into the build (PROTOYARD_AVATAR_BASE; the showcase uses `<base>avatars/`).
   */
  avatarBase?: string;
  /** Ship only these avatar sizes (PROTOYARD_AVATAR_SIZES; the artifact target ships 128). */
  avatarSizes?: readonly number[];
  /**
   * Review comments forced on with this adapter and endpoint (PROTOYARD_REVIEW=1,
   * PROTOYARD_REVIEW_ADAPTER, PROTOYARD_REVIEW_ENDPOINT; `publish --comments`).
   */
  review?: { adapter: 'http' | 'cloudflare'; endpoint: string };
  /** Pipe output (for --json) instead of inheriting the terminal. */
  quiet: boolean;
}

export function buildEnv(
  options: Pick<
    ViteBuildOptions,
    | 'outDir'
    | 'base'
    | 'includeDevtools'
    | 'offline'
    | 'storageNamespace'
    | 'frameWhenEmbedded'
    | 'avatarBase'
    | 'avatarSizes'
    | 'review'
  >
) {
  return {
    ...process.env,
    NODE_ENV: 'production',
    PROTOYARD_OUT_DIR: options.outDir,
    PROTOYARD_BASE: options.base,
    PROTOYARD_INCLUDE_DEVTOOLS: options.includeDevtools ? '1' : '0',
    // Only forced on by --offline; otherwise the manifest's build.offline decides.
    ...(options.offline ? { PROTOYARD_OFFLINE: '1' } : {}),
    // Set explicitly either way, so an inherited value never renames a build's storage.
    PROTOYARD_STORAGE_NAMESPACE: options.storageNamespace ?? '',
    // Only forced on by the artifact target; otherwise the manifest decides.
    PROTOYARD_FRAME_WHEN_EMBEDDED: options.frameWhenEmbedded ? '1' : '',
    // Set explicitly either way, so an inherited value never drops a build's avatars.
    PROTOYARD_AVATAR_BASE: options.avatarBase ?? '',
    PROTOYARD_AVATAR_SIZES: options.avatarSizes ? options.avatarSizes.join(',') : '',
    // Only `publish --comments` forces review on with its backend; otherwise
    // PROTOYARD_REVIEW / PROTOYARD_REVIEW_ADAPTER from the shell or the manifest decide.
    ...(options.review
      ? {
          PROTOYARD_REVIEW: '1',
          PROTOYARD_REVIEW_ADAPTER: options.review.adapter,
          PROTOYARD_REVIEW_ENDPOINT: options.review.endpoint,
        }
      : {}),
  };
}

export function viteBuildArgs(config: string, options: Pick<ViteBuildOptions, 'outDir' | 'base'>) {
  // CLI flags win over the config file, so the output location is guaranteed
  // even if a prototype's config ignores the PROTOYARD_* variables.
  return [
    'build',
    '--config',
    config,
    '--outDir',
    options.outDir,
    '--emptyOutDir',
    '--base',
    options.base,
  ];
}

export function viteBuild(options: ViteBuildOptions): Promise<{ code: number; log: string }> {
  const config = findViteConfig(options.dir);
  if (!config) {
    throw new CliError('validation', `No vite.config.ts in ${options.dir}.`, {
      hint: 'Every prototype needs the folder contract files; run `pnpm protoyard validate <slug>`.',
    });
  }
  const bin = resolveViteBin(options.dir, options.root);
  return new Promise((resolvePromise) => {
    let log = '';
    const nodeArgs = nodeLoaderArgs(options.dir, options.root);
    const child = spawn(process.execPath, [...nodeArgs, bin, ...viteBuildArgs(config, options)], {
      cwd: options.dir,
      env: buildEnv(options),
      shell: false,
      stdio: options.quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });
    const collect = (chunk: Buffer) => {
      log = (log + chunk.toString()).slice(-16_000);
    };
    child.stdout?.on('data', collect);
    child.stderr?.on('data', collect);
    child.on('error', (error) => resolvePromise({ code: 127, log: error.message }));
    child.on('close', (code) => resolvePromise({ code: code ?? 1, log }));
  });
}

export interface ViteDevOptions {
  dir: string;
  root: string;
  port: number;
  host: boolean;
  /** `inherit` for `protoyard dev`; `pipe` for the control server. */
  stdio: 'inherit' | 'pipe';
  /** When set, Vite/runtime use this IndexedDB namespace instead of the manifest's. */
  storageNamespace?: string;
}

/**
 * Environment for a dev server. Like `buildEnv`, it always sets
 * PROTOYARD_STORAGE_NAMESPACE (empty unless a template demo asks for one), so a
 * value inherited from the parent shell never renames a prototype's IndexedDB.
 */
export function devEnv(
  options: Pick<ViteDevOptions, 'storageNamespace'>,
  base: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  return {
    ...base,
    PROTOYARD_INCLUDE_DEVTOOLS: '1',
    PROTOYARD_STORAGE_NAMESPACE: options.storageNamespace ?? '',
  };
}

export function spawnViteDev(options: ViteDevOptions): ChildProcess {
  const config = findViteConfig(options.dir);
  if (!config) {
    throw new CliError('validation', `No vite.config.ts in ${options.dir}.`);
  }
  const bin = resolveViteBin(options.dir, options.root);
  const args = [
    ...nodeLoaderArgs(options.dir, options.root),
    bin,
    '--config',
    config,
    '--port',
    String(options.port),
    '--strictPort',
  ];
  args.push('--host', options.host ? '0.0.0.0' : '127.0.0.1');
  return spawn(process.execPath, args, {
    cwd: options.dir,
    env: devEnv(options),
    shell: false,
    stdio: options.stdio === 'inherit' ? 'inherit' : ['ignore', 'pipe', 'pipe'],
  });
}
