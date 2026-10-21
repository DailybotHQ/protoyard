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
 * - a tarball size cap and the lockstep version (the root package.json);
 * - the public-hygiene rules over every packed file (scripts/lib/tarball-hygiene.ts):
 *   keys, tokens, .env and key files, home paths (also in source maps), real emails.
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
import {
  closeSync,
  existsSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { parseAllowFile, scanTarballFiles } from './lib/tarball-hygiene.ts';

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
  | 'hygiene'
  | 'pack'
  | 'case-collision'
  | 'svelte-declaration'
  | 'required-file';

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
  /** attw problems dropped by a named exception, counted per exception (never silent). */
  exceptions?: Record<string, number>;
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
  protoyard?: { pack?: PackPolicy };
}

/**
 * `protoyard.pack` in a manifest: an app or content package (the gallery, the
 * templates aggregate) declares the folders it ships as payload. Payload files
 * skip only the test-path and TypeScript-source rules; env and key files,
 * hygiene, size and local-specifier rules still apply. `types: false` skips attw
 * for a package with no importable typed API. `required` lists packed paths
 * that must be in the tarball (the player's prebuilt app, which a separate
 * build step produces).
 */
export interface PackPolicy {
  payload?: string[];
  types?: boolean;
  required?: string[];
}

/** Every `protoyard.pack.required` path is in the packed file set. */
export function requiredFileFindings(
  manifest: Manifest,
  files: ReadonlyMap<string, Uint8Array>
): Finding[] {
  const required = manifest.protoyard?.pack?.required;
  if (!Array.isArray(required)) return [];
  return required
    .filter((path) => typeof path === 'string' && !files.has(path))
    .map((path) => ({
      rule: 'required-file' as const,
      message: `${path} is required (protoyard.pack.required) but not in the tarball`,
    }));
}

/** The payload prefixes a manifest declares, normalized to end in `/`. */
export function payloadPrefixes(manifest: Manifest): string[] {
  const payload = manifest.protoyard?.pack?.payload;
  if (!Array.isArray(payload)) return [];
  return payload
    .filter(
      (p): p is string =>
        typeof p === 'string' && p.length > 0 && !p.startsWith('/') && !p.includes('..')
    )
    .map((p) => (p.endsWith('/') ? p : `${p}/`));
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
export function fileFindings(
  files: Map<string, Uint8Array>,
  payload: readonly string[] = []
): Finding[] {
  const findings: Finding[] = [];
  const inPayload = (path: string) => payload.some((prefix) => path.startsWith(prefix));
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
    const payloadFile = inPayload(path);
    if (!payloadFile && (TEST_PATH.test(path) || TEST_FILE.test(path))) {
      findings.push({ rule: 'forbidden-file', message: `${path} is a test, fixture or snapshot` });
    } else if (ENV_FILE.test(path)) {
      findings.push({ rule: 'forbidden-file', message: `${path} is an environment file` });
    } else if (
      !payloadFile &&
      TS_SOURCE.test(path) &&
      !DECLARATION.test(path) &&
      !mapped.has(path)
    ) {
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

/**
 * Hygiene findings as `path:line: rule` (never the matched text). An env file
 * the allowlist already reported as forbidden is not reported twice.
 */
export function hygieneFindings(
  files: Map<string, Uint8Array>,
  packagePath: string,
  root: string = REPO,
  already: readonly Finding[] = []
): Finding[] {
  const allowPath = join(root, '.public-hygiene-allow');
  const allow = existsSync(allowPath) ? parseAllowFile(readFileSync(allowPath, 'utf8')) : [];
  return scanTarballFiles(files, { packagePath, allow })
    .filter(
      (f) =>
        f.rule !== 'env-file' ||
        !already.some((a) => a.message.startsWith(`${f.path} is an environment file`))
    )
    .map((f) => ({ rule: 'hygiene' as const, message: `${f.path}:${f.line}: ${f.rule}` }));
}

/**
 * Source files whose build outputs differ only by letter case, such as
 * `Router.svelte` (emits `Router.svelte.d.ts`) beside `router.svelte.ts`
 * (emits `router.svelte.d.ts`). On a case-insensitive file system (macOS,
 * Windows) one output overwrites the other at build time and on install.
 */
export function caseCollisionFindings(dir: string): Finding[] {
  const src = join(dir, 'src');
  if (!existsSync(src)) return [];
  const seen = new Map<string, string>();
  const findings: Finding[] = [];
  const walk = (folder: string) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) {
        const rel = relative(src, path).split('\\').join('/');
        const key = rel.replace(/\.(ts|js)$/, '').toLowerCase();
        const other = seen.get(key);
        if (other)
          findings.push({
            rule: 'case-collision',
            message: `src/${other} and src/${rel} emit outputs that differ only by case`,
          });
        else seen.set(key, rel);
      }
    }
  };
  walk(src);
  return findings;
}

/**
 * An emitted `X.svelte.d.ts` declares the component as `X` (svelte2tsx). A
 * component that also imports a binding named `X` produces a declaration
 * where the import shadows the component, so consumers see a type, not the
 * component. Alias the import (`import type { X as Y }`).
 */
export function svelteDeclarationFindings(files: ReadonlyMap<string, Uint8Array>): Finding[] {
  const findings: Finding[] = [];
  for (const [path, bytes] of files) {
    const match = /(?:^|\/)([A-Za-z_$][\w$]*)\.svelte\.d\.ts$/.exec(path);
    if (!match) continue;
    const name = match[1] ?? '';
    const text = new TextDecoder().decode(bytes);
    for (const imported of text.matchAll(/^import\s+(?:type\s+)?([^;]*?)\s+from\s/gm)) {
      const clause = imported[1] ?? '';
      const bindings = [
        ...clause.replace(/\{([^}]*)\}/, '').split(','),
        ...(/\{([^}]*)\}/.exec(clause)?.[1] ?? '').split(','),
      ]
        .map((b) => b.trim().replace(/^type\s+/, ''))
        .filter(Boolean)
        .map((b) =>
          (b.includes(' as ') ? (b.split(' as ')[1] ?? '') : b).replace(/^\*\s+as\s+/, '').trim()
        );
      if (bindings.includes(name)) {
        findings.push({
          rule: 'svelte-declaration',
          message: `${path} imports \`${name}\`, which shadows the component's own declaration`,
        });
        break;
      }
    }
  }
  return findings;
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
  /** InternalResolutionError: the import that did not resolve, and where. */
  resolutionOption?: string;
  fileName?: string;
  moduleSpecifier?: string;
}

/**
 * The one named attw exception (docs/PACKAGES.md, "attw and Svelte
 * components"). TypeScript's node16 mode never resolves `./X.svelte`: it
 * looks only for `X.d.svelte.ts`, while svelte-package emits `X.svelte.d.ts`,
 * which bundler resolution, Vite and svelte-check all read. The exception
 * drops exactly that problem, and only when the component and its emitted
 * declaration are both in the tarball, so a missing declaration still fails
 * (attw then also reports it under bundler and node10).
 */
export const SVELTE_COMPONENT_EXCEPTION = 'svelte-component-declaration';

export function isSvelteComponentDeclarationProblem(
  problem: AttwProblem,
  packageName: string,
  files: ReadonlySet<string>
): boolean {
  if (problem.kind !== 'InternalResolutionError' || problem.resolutionOption !== 'node16')
    return false;
  const specifier = problem.moduleSpecifier ?? '';
  if (!/^\.\.?\/[^?#]*\.svelte$/.test(specifier)) return false;
  const prefix = `/node_modules/${packageName}/`;
  if (!problem.fileName?.startsWith(prefix)) return false;
  const from = posix.dirname(problem.fileName.slice(prefix.length));
  const component = posix.normalize(posix.join(from, specifier));
  if (component.startsWith('../')) return false;
  return files.has(component) && files.has(`${component}.d.ts`);
}

/** Problems that count under the esm-only profile, from attw's JSON output. */
export function attwProblems(json: string): AttwProblem[] {
  const parsed = JSON.parse(json) as { analysis?: { problems?: AttwProblem[] } };
  return (parsed.analysis?.problems ?? []).filter(
    (p) => !p.resolutionKind || !ESM_ONLY_IGNORED.has(p.resolutionKind)
  );
}

/** arethetypeswrong over the tarball, profile esm-only (run from this repository, where it is installed). */
export function attwFindings(
  tarballPath: string,
  packed?: { name: string; files: ReadonlySet<string>; exceptions?: Record<string, number> }
): Finding[] {
  // attw exits before a piped stdout drains, which cuts large reports at 64 KiB;
  // a file descriptor receives the whole report.
  const dir = mkdtempSync(join(tmpdir(), 'protoyard-attw-'));
  const reportPath = join(dir, 'attw.json');
  const fd = openSync(reportPath, 'w');
  let result: ReturnType<typeof spawnSync>;
  let stdout: string;
  try {
    result = spawnSync(
      'pnpm',
      ['exec', 'attw', tarballPath, '--profile', 'esm-only', '--format', 'json', '--no-color'],
      {
        cwd: REPO,
        encoding: 'utf8',
        env: { ...process.env, NO_COLOR: '1' },
        stdio: ['ignore', fd, 'pipe'],
      }
    );
  } finally {
    closeSync(fd);
  }
  try {
    stdout = readFileSync(reportPath, 'utf8');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  let problems: AttwProblem[];
  let reported = 0;
  try {
    problems = attwProblems(stdout);
    reported = problems.length;
    if (packed) {
      const kept = problems.filter(
        (p) => !isSvelteComponentDeclarationProblem(p, packed.name, packed.files)
      );
      const dropped = problems.length - kept.length;
      if (dropped > 0 && packed.exceptions)
        packed.exceptions[SVELTE_COMPONENT_EXCEPTION] =
          (packed.exceptions[SVELTE_COMPONENT_EXCEPTION] ?? 0) + dropped;
      problems = kept;
    }
  } catch {
    const detail = (String(result.stderr ?? '') || stdout).trim().slice(0, 500);
    return [{ rule: 'attw', message: `attw did not report: ${detail}` }];
  }
  const findings: Finding[] = problems.map((p) => ({
    rule: 'attw',
    message: `${p.kind}${p.entrypoint ? ` at "${p.entrypoint}"` : ''}${p.resolutionKind ? ` (${p.resolutionKind})` : ''}`,
  }));
  // A non-zero exit with no problem in the report at all (not one dropped by an exception).
  if (reported === 0 && result.status !== 0) {
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
    findings: [
      ...manifestFindings(manifest, lockstepVersion),
      ...caseCollisionFindings(candidate.dir),
    ],
  };
  if (!manifest.publishConfig) {
    report.pending = 'no publishConfig yet: not packed (add publishConfig to pack it)';
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
      const fileLevel = fileFindings(files, payloadPrefixes(manifest));
      report.findings.push(...fileLevel);
      report.findings.push(...svelteDeclarationFindings(files));
      report.findings.push(...requiredFileFindings(manifest, files));
      report.findings.push(...hygieneFindings(files, report.path, root, fileLevel));
      const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
      if (tarball.byteLength > maxBytes) {
        report.findings.push({
          rule: 'size',
          message: `tarball is ${tarball.byteLength} B, over the ${maxBytes} B cap`,
        });
      }
      report.findings.push(...(await publintFindings(tarball)));
      const typed = manifest.protoyard?.pack?.types !== false;
      if (options.attw !== false && typed) {
        const exceptions: Record<string, number> = {};
        report.findings.push(
          ...attwFindings(tarballPath, {
            name: String(manifest.name),
            files: new Set(files.keys()),
            exceptions,
          })
        );
        if (Object.keys(exceptions).length > 0) report.exceptions = exceptions;
      }
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
    for (const [name, n] of Object.entries(p.exceptions ?? {}))
      lines.push(`  · attw exception ${name}: ${n} problem(s) not counted`);
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
