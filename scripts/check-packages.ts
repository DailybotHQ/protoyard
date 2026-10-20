/**
 * `pnpm check:packages` — lint what npm consumers would actually install.
 *
 * Every publishable package (packages/*, apps/gallery; never `private`) is
 * packed with `pnpm pack` into a temp dir, so `publishConfig` and the
 * `workspace:` → exact-version rewrite apply exactly as on release (ADR-028).
 * Each tarball then runs through:
 *
 * - publint (strict: warnings are errors) on the tarball itself;
 * - arethetypeswrong with the `esm-only` profile;
 * - a packed-file allowlist: no tests, fixtures or snapshots; no `.env`; no
 *   TypeScript source unless a packed declaration map points at it;
 * - the packed manifest: no `workspace:`/`link:`/`file:` specifiers and no
 *   install lifecycle scripts;
 * - a tarball size cap and the lockstep version (the root package.json).
 *
 * A package without `publishConfig` is not publish-ready yet: it is reported
 * as `pending` (manifest checks only, never packed) and does not fail the run
 * unless `--require-all` is passed, which the release gate uses.
 *
 *   pnpm check:packages [--json] [--require-all] [--filter <name>]... [--max-bytes <n>] [--root <dir>]
 *
 * Exit codes: 0 every checked package passes, 1 a violation (or a pending
 * package with --require-all), 2 usage.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)));

/** Default tarball cap (gzip bytes). The avatars library is the largest today. */
export const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

class UsageError extends Error {}

export type RuleId =
  | 'version'
  | 'install-script'
  | 'local-specifier'
  | 'forbidden-file'
  | 'source-file'
  | 'size'
  | 'publint'
  | 'attw'
  | 'pack';

export interface Finding {
  rule: RuleId;
  message: string;
}

export type PackageStatus = 'pass' | 'fail' | 'pending';

export interface PackageReport {
  name: string;
  /** Repository-relative folder. */
  path: string;
  version: string;
  status: PackageStatus;
  /** Why the package was not packed (status `pending`). */
  pending?: string;
  tarballBytes?: number;
  fileCount?: number;
  findings: Finding[];
}

export interface CheckReport {
  format: 'protoyard.check-packages';
  version: 1;
  lockstepVersion: string;
  requireAll: boolean;
  ok: boolean;
  packages: PackageReport[];
}

interface Manifest {
  name?: string;
  version?: string;
  private?: boolean;
  scripts?: Record<string, string>;
  publishConfig?: Record<string, unknown>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

export interface Candidate {
  dir: string;
  manifest: Manifest;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

/** Publishable candidates: every non-private manifest in packages/* and apps/gallery, by name. */
export function findCandidates(root: string = REPO): Candidate[] {
  const dirs: string[] = [];
  const packages = join(root, 'packages');
  if (existsSync(packages)) {
    for (const name of readdirSync(packages)) dirs.push(join(packages, name));
  }
  dirs.push(join(root, 'apps', 'gallery'));
  return dirs
    .filter((dir) => existsSync(join(dir, 'package.json')))
    .map((dir) => ({ dir, manifest: readJson<Manifest>(join(dir, 'package.json')) }))
    .filter((c) => c.manifest.private !== true)
    .sort((a, b) => String(a.manifest.name).localeCompare(String(b.manifest.name)));
}

const INSTALL_SCRIPTS = ['preinstall', 'install', 'postinstall'] as const;
const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const;

/** Checks that hold for the source manifest and the packed one alike. */
export function manifestFindings(manifest: Manifest, lockstepVersion: string): Finding[] {
  const findings: Finding[] = [];
  if (manifest.version !== lockstepVersion) {
    findings.push({
      rule: 'version',
      message: `version ${manifest.version ?? '(none)'} differs from the lockstep version ${lockstepVersion}`,
    });
  }
  for (const script of INSTALL_SCRIPTS) {
    if (manifest.scripts?.[script] !== undefined) {
      findings.push({
        rule: 'install-script',
        message: `"${script}" lifecycle script runs on every consumer install`,
      });
    }
  }
  return findings;
}

/** Specifiers that only mean something inside this repository. */
export function localSpecifierFindings(manifest: Manifest): Finding[] {
  const findings: Finding[] = [];
  for (const field of DEPENDENCY_FIELDS) {
    for (const [dep, range] of Object.entries(manifest[field] ?? {})) {
      if (/^(workspace|link|file):/.test(range)) {
        findings.push({
          rule: 'local-specifier',
          message: `${field}.${dep} is "${range}" in the packed manifest`,
        });
      }
    }
  }
  return findings;
}

const TEST_PATH = /(^|\/)(tests?|__tests__|__snapshots__|fixtures?|coverage)\//;
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;
const ENV_FILE = /(^|\/)\.env(\.(?!example$)[^/]*)?$/;
const TS_SOURCE = /\.[cm]?tsx?$/;
const DECLARATION = /\.d\.[cm]?ts$/;

/**
 * File-level rules over a tarball's contents (paths relative to `package/`).
 * TypeScript source may ship only as the target of a packed declaration map.
 */
export function fileFindings(files: Map<string, Uint8Array>): Finding[] {
  const findings: Finding[] = [];
  const mapped = new Set<string>();
  for (const [path, data] of files) {
    if (!path.endsWith('.d.ts.map') && !/\.d\.[cm]ts\.map$/.test(path)) continue;
    try {
      const map = JSON.parse(new TextDecoder().decode(data)) as { sources?: unknown };
      const base = path.split('/').slice(0, -1).join('/');
      for (const source of Array.isArray(map.sources) ? map.sources : []) {
        if (typeof source !== 'string') continue;
        mapped.add(normalize(base ? `${base}/${source}` : source));
      }
    } catch {
      findings.push({ rule: 'forbidden-file', message: `${path} is not a valid source map` });
    }
  }
  for (const path of [...files.keys()].sort()) {
    if (TEST_PATH.test(path) || TEST_FILE.test(path)) {
      findings.push({ rule: 'forbidden-file', message: `${path} is a test, fixture or snapshot` });
    } else if (ENV_FILE.test(path)) {
      findings.push({ rule: 'forbidden-file', message: `${path} is an environment file` });
    } else if (TS_SOURCE.test(path) && !DECLARATION.test(path) && !mapped.has(path)) {
      findings.push({
        rule: 'source-file',
        message: `${path} is TypeScript source that no packed declaration map references`,
      });
    }
  }
  return findings;
}

/** Resolves `a/b/../c` segments; paths never leave the package root. */
function normalize(path: string): string {
  const out: string[] = [];
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') out.pop();
    else out.push(segment);
  }
  return out.join('/');
}

/**
 * Reads a gzipped npm tarball into `path → bytes`, stripping the `package/`
 * prefix. Supports ustar prefixes and pax `path` records; only regular files
 * are kept.
 */
export function readTarball(gz: Uint8Array): Map<string, Uint8Array> {
  const tar = gunzipSync(gz);
  const files = new Map<string, Uint8Array>();
  const text = (from: number, length: number) =>
    new TextDecoder().decode(tar.subarray(from, from + length)).replace(/\0.*$/s, '');
  let offset = 0;
  let paxPath: string | undefined;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const size = Number.parseInt(text(offset + 124, 12).trim() || '0', 8);
    const type = String.fromCharCode(header[156] ?? 0);
    const body = tar.subarray(offset + 512, offset + 512 + size);
    if (type === 'x') {
      const match = /\d+ path=([^\n]*)\n/.exec(new TextDecoder().decode(body));
      paxPath = match?.[1];
    } else {
      const prefix = text(offset + 345, 155);
      const name = paxPath ?? (prefix ? `${prefix}/${text(offset, 100)}` : text(offset, 100));
      paxPath = undefined;
      if (type === '0' || type === '\0') {
        files.set(name.replace(/^[^/]+\//, ''), body.slice());
      }
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}

/** Packs `dir` with pnpm into `destination`; returns the tarball path. */
export function packPackage(dir: string, destination: string): string {
  const result = spawnSync('pnpm', ['pack', '--pack-destination', destination, '--json'], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  });
  if (result.status !== 0) {
    throw new Error(`pnpm pack failed in ${dir}: ${(result.stderr || result.stdout).trim()}`);
  }
  const out = JSON.parse(result.stdout) as { filename?: string } | { filename?: string }[];
  const filename = Array.isArray(out) ? out[0]?.filename : out.filename;
  if (!filename || !existsSync(filename)) {
    throw new Error(`pnpm pack in ${dir} did not report a tarball`);
  }
  return filename;
}

/** publint in strict mode over the exact tarball. */
export async function publintFindings(tarball: Uint8Array): Promise<Finding[]> {
  const { publint } = await import('publint');
  const { formatMessage } = await import('publint/utils');
  const buffer = tarball.buffer.slice(
    tarball.byteOffset,
    tarball.byteOffset + tarball.byteLength
  ) as ArrayBuffer;
  const { messages, pkg } = await publint({
    pack: { tarball: buffer },
    strict: true,
    level: 'warning',
  });
  return messages
    .filter((m) => m.type === 'error' || m.type === 'warning')
    .map((m) => ({
      rule: 'publint' as const,
      message: `${m.code}: ${formatMessage(m, pkg, { color: false }) ?? m.code}`,
    }));
}

/** Resolution kinds the `esm-only` profile ignores (matches attw's own profile). */
const ESM_ONLY_IGNORED = new Set(['node10', 'node16-cjs']);

interface AttwProblem {
  kind: string;
  entrypoint?: string;
  resolutionKind?: string;
}

/** Problems that count under the esm-only profile, from attw's JSON output. */
export function attwProblems(json: string): AttwProblem[] {
  const parsed = JSON.parse(json) as { analysis?: { problems?: AttwProblem[] } };
  return (parsed.analysis?.problems ?? []).filter(
    (p) => !p.resolutionKind || !ESM_ONLY_IGNORED.has(p.resolutionKind)
  );
}

/** arethetypeswrong over the tarball, profile esm-only (run from this repository, where it is installed). */
export function attwFindings(tarballPath: string): Finding[] {
  const result = spawnSync(
    'pnpm',
    ['exec', 'attw', tarballPath, '--profile', 'esm-only', '--format', 'json', '--no-color'],
    { cwd: REPO, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } }
  );
  let problems: AttwProblem[];
  try {
    problems = attwProblems(result.stdout);
  } catch {
    return [
      { rule: 'attw', message: `attw did not report: ${(result.stderr || result.stdout).trim()}` },
    ];
  }
  const findings: Finding[] = problems.map((p) => ({
    rule: 'attw',
    message: `${p.kind}${p.entrypoint ? ` at "${p.entrypoint}"` : ''}${p.resolutionKind ? ` (${p.resolutionKind})` : ''}`,
  }));
  if (findings.length === 0 && result.status !== 0) {
    findings.push({
      rule: 'attw',
      message: `attw exited ${result.status} without a listed problem`,
    });
  }
  return findings;
}

export interface CheckOptions {
  root?: string;
  /** Package names to check (default: all candidates). */
  filter?: string[];
  maxBytes?: number;
  requireAll?: boolean;
  /** Skip the attw subprocess (unit tests that cover it separately). */
  attw?: boolean;
}

/** Lints one candidate: manifest checks always, pack checks once publish-ready. */
export async function checkPackage(
  candidate: Candidate,
  lockstepVersion: string,
  options: CheckOptions = {}
): Promise<PackageReport> {
  const root = options.root ?? REPO;
  const { manifest } = candidate;
  const report: PackageReport = {
    name: manifest.name ?? relative(root, candidate.dir),
    path: relative(root, candidate.dir),
    version: manifest.version ?? '',
    status: 'pass',
    findings: manifestFindings(manifest, lockstepVersion),
  };
  if (!manifest.publishConfig) {
    report.pending =
      'no publishConfig yet: not packed (dist exports land in PLAN_004 Tasks 10, 11 and 18)';
  } else {
    const destination = mkdtempSync(join(tmpdir(), 'protoyard-check-packages-'));
    try {
      const tarballPath = packPackage(candidate.dir, destination);
      const tarball = new Uint8Array(readFileSync(tarballPath));
      const files = readTarball(tarball);
      report.tarballBytes = tarball.byteLength;
      report.fileCount = files.size;
      const packedManifestBytes = files.get('package.json');
      if (packedManifestBytes) {
        const packed = JSON.parse(new TextDecoder().decode(packedManifestBytes)) as Manifest;
        report.findings.push(...localSpecifierFindings(packed));
        // Lifecycle scripts can come back through publishConfig; re-check the packed copy.
        for (const f of manifestFindings(packed, lockstepVersion)) {
          if (
            f.rule === 'install-script' &&
            !report.findings.some((x) => x.message === f.message)
          ) {
            report.findings.push(f);
          }
        }
      }
      report.findings.push(...fileFindings(files));
      const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
      if (tarball.byteLength > maxBytes) {
        report.findings.push({
          rule: 'size',
          message: `tarball is ${tarball.byteLength} B, over the ${maxBytes} B cap`,
        });
      }
      report.findings.push(...(await publintFindings(tarball)));
      if (options.attw !== false) report.findings.push(...attwFindings(tarballPath));
    } catch (error) {
      report.findings.push({ rule: 'pack', message: (error as Error).message });
    } finally {
      rmSync(destination, { recursive: true, force: true });
    }
  }
  report.status =
    report.findings.length > 0 ? 'fail' : report.pending !== undefined ? 'pending' : 'pass';
  return report;
}

export async function checkPackages(options: CheckOptions = {}): Promise<CheckReport> {
  const root = options.root ?? REPO;
  const lockstepVersion = readJson<Manifest>(join(root, 'package.json')).version ?? '';
  let candidates = findCandidates(root);
  if (options.filter && options.filter.length > 0) {
    const wanted = new Set(options.filter);
    const unknown = options.filter.filter((n) => !candidates.some((c) => c.manifest.name === n));
    if (unknown.length > 0) throw new UsageError(`Unknown package: ${unknown.join(', ')}`);
    candidates = candidates.filter((c) => wanted.has(String(c.manifest.name)));
  }
  const packages: PackageReport[] = [];
  for (const candidate of candidates) {
    packages.push(await checkPackage(candidate, lockstepVersion, { ...options, root }));
  }
  const requireAll = options.requireAll === true;
  const ok = packages.every((p) => p.status === 'pass' || (p.status === 'pending' && !requireAll));
  return {
    format: 'protoyard.check-packages',
    version: 1,
    lockstepVersion,
    requireAll,
    ok,
    packages,
  };
}

export function formatTable(report: CheckReport): string {
  const lines: string[] = [];
  const width = Math.max(7, ...report.packages.map((p) => p.name.length));
  lines.push(`${'package'.padEnd(width)}  status   size       files`);
  for (const p of report.packages) {
    const size = p.tarballBytes === undefined ? '-' : `${(p.tarballBytes / 1024).toFixed(1)} KB`;
    lines.push(
      `${p.name.padEnd(width)}  ${p.status.padEnd(7)}  ${size.padEnd(9)}  ${p.fileCount ?? '-'}`
    );
    for (const f of p.findings) lines.push(`  ✗ [${f.rule}] ${f.message}`);
  }
  const count = (s: PackageStatus) => report.packages.filter((p) => p.status === s).length;
  lines.push('');
  lines.push(
    `${count('pass')} pass, ${count('fail')} fail, ${count('pending')} pending (lockstep ${report.lockstepVersion})`
  );
  if (count('pending') > 0) {
    lines.push(
      report.requireAll
        ? 'Pending packages fail because --require-all is set.'
        : 'Pending packages have no publishConfig yet; pass --require-all to fail on them.'
    );
  }
  return lines.join('\n');
}

export function parseArgs(argv: string[]): CheckOptions & { json: boolean } {
  const options: CheckOptions & { json: boolean } = { json: false, filter: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') options.json = true;
    else if (arg === '--require-all') options.requireAll = true;
    else if (arg === '--root') {
      const value = argv[++i];
      if (!value) throw new UsageError('--root needs a directory');
      options.root = resolve(value);
    } else if (arg === '--filter') {
      const value = argv[++i];
      if (!value) throw new UsageError('--filter needs a package name');
      options.filter?.push(value);
    } else if (arg === '--max-bytes') {
      const value = Number(argv[++i]);
      if (!Number.isInteger(value) || value <= 0)
        throw new UsageError('--max-bytes needs a positive integer');
      options.maxBytes = value;
    } else throw new UsageError(`Unknown option ${arg}`);
  }
  return options;
}

async function main(): Promise<void> {
  try {
    const options = parseArgs(process.argv.slice(2));
    const report = await checkPackages(options);
    console.log(options.json ? JSON.stringify(report, null, 2) : formatTable(report));
    process.exitCode = report.ok ? 0 : 1;
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(`check-packages: ${error.message}`);
      process.exitCode = 2;
      return;
    }
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
