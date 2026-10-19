import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { run, stripAnsi, which } from '../lib/process.ts';
import type { Availability } from './types.ts';

/**
 * Locates a provider CLI without installing anything: PATH first, then the
 * workspace's node_modules/.bin, then `npx --no-install` (which only succeeds
 * when the package is already in the npx cache or installed).
 */
export interface ToolInvocation {
  argv: string[];
  via: string;
}

export interface LocateOptions {
  /** PATH and node_modules/.bin only — never spawn npx (dry runs, doctor --offline). */
  localOnly?: boolean;
}

export async function locateTool(
  binary: string,
  root: string,
  options: LocateOptions = {}
): Promise<ToolInvocation | null> {
  const onPath = await which(binary);
  if (onPath) return { argv: [onPath], via: binary };
  const local = join(root, 'node_modules', '.bin', binary);
  if (existsSync(local)) return { argv: [local], via: `node_modules/.bin/${binary}` };
  if (options.localOnly) return null;
  const npx = await which('npx');
  if (npx) {
    // --no-install alone still asks the registry about the package; offline
    // mode limits the probe to the local npm cache.
    const probe = await run(npx, ['--no-install', binary, '--version'], {
      timeoutMs: 20_000,
      env: { ...process.env, npm_config_offline: 'true' },
    });
    if (probe.code === 0)
      return { argv: [npx, '--no-install', binary], via: `npx --no-install ${binary}` };
  }
  return null;
}

export async function toolAvailability(
  binary: string,
  root: string,
  installHint: string,
  options: LocateOptions = {}
): Promise<Availability & { invocation?: ToolInvocation }> {
  const invocation = await locateTool(binary, root, options);
  if (!invocation) return { available: false, hint: installHint };
  const [cmd, ...prefix] = invocation.argv as [string, ...string[]];
  const version = await run(cmd, [...prefix, '--version'], {
    timeoutMs: 20_000,
    env: { ...process.env, npm_config_offline: 'true' },
  });
  const firstLine = stripAnsi(version.stdout).trim().split('\n').find(Boolean);
  return {
    available: version.code === 0,
    via: invocation.via,
    ...(firstLine ? { version: firstLine.trim() } : {}),
    invocation,
    ...(version.code === 0 ? {} : { hint: installHint }),
  };
}

/** Human-readable command line for dry runs (quoted only where needed). */
export function formatCommand(argv: readonly string[]): string {
  return argv
    .map((a) => (/^[\w@%+=:,./-]+$/.test(a) ? a : `'${a.replace(/'/g, `'\\''`)}'`))
    .join(' ');
}

/**
 * The tail of a provider CLI's output, for error hints. Account ids (32 hex
 * characters, e.g. in Cloudflare `/accounts/<id>/` API URLs) and email
 * addresses are redacted, because hints are printed and included in --json.
 */
export function lastLines(text: string, count = 12): string {
  return redactAccountDetails(stripAnsi(text).trim().split('\n').slice(-count).join('\n'));
}

export function redactAccountDetails(text: string): string {
  return text
    .replace(/\b[0-9a-f]{32}\b/gi, '<account-id>')
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '<email>');
}
