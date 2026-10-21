/**
 * `pnpm verify:packages [--pm pnpm|npm]` — prove the published packages in a
 * clean consumer workspace without consulting a registry.
 *
 * The package build is deliberately a prerequisite. This command only packs
 * the already-built artifacts, installs those tarballs by file path, and runs
 * the same CLI loop a consumer would run.
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type PackageManager = 'pnpm' | 'npm';

export interface VerifyOptions {
  root?: string;
  pm?: PackageManager;
  keep?: boolean;
  budgetParity?: boolean;
}

export interface VerifyResult {
  ok: boolean;
  packageManager: PackageManager;
  root: string;
  consumer: string;
  packages: string[];
  steps: { name: string; ok: boolean; detail?: string }[];
}

export interface BudgetParityResult {
  ok: boolean;
  sourceInitialJsGzipKb: number;
  distInitialJsGzipKb: number;
  deltaKb: number;
  maxDeltaKb: 2;
  maxInitialJsGzipKb: 250;
}

interface PackageManifest {
  name?: string;
  private?: boolean;
  version?: string;
}

interface PackedPackage {
  name: string;
  version: string;
  directory: string;
  tarball: string;
}

const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PRIVATE_DIRS = new Set(['node_modules', 'dist']);

function manifest(path: string): PackageManifest {
  return JSON.parse(readFileSync(join(path, 'package.json'), 'utf8')) as PackageManifest;
}

/** Published package folders, including the two unscoped entry packages. */
export function packageDirectories(root: string): string[] {
  const packagesRoot = join(root, 'packages');
  const directories = readdirSync(packagesRoot)
    .filter((name) => !PRIVATE_DIRS.has(name))
    .map((name) => join(packagesRoot, name));
  directories.push(join(root, 'apps', 'gallery'));
  return directories
    .filter((directory) => existsSync(join(directory, 'package.json')))
    .filter((directory) => manifest(directory).private !== true)
    .sort((a, b) => (manifest(a).name ?? '').localeCompare(manifest(b).name ?? ''));
}

/** Parse the only supported command options so bad invocations fail clearly. */
export function parseArgs(args: readonly string[]): VerifyOptions {
  let pm: PackageManager = 'pnpm';
  let keep = false;
  let budgetParity = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--pm') {
      const value = args[++index];
      if (value !== 'pnpm' && value !== 'npm') throw new Error('--pm must be pnpm or npm');
      pm = value;
    } else if (arg?.startsWith('--pm=')) {
      const value = arg.slice('--pm='.length);
      if (value !== 'pnpm' && value !== 'npm') throw new Error('--pm must be pnpm or npm');
      pm = value;
    } else if (arg === '--keep') {
      keep = true;
    } else if (arg === '--budget-parity') {
      budgetParity = true;
    } else {
      throw new Error(`Unknown option: ${arg ?? '(missing)'}`);
    }
  }
  return { pm, keep, budgetParity };
}

/** Compare a packed consumer build with the same template built from workspace source. */
export function compareBudgetParity(
  sourceInitialJsGzipKb: number,
  distInitialJsGzipKb: number
): BudgetParityResult {
  const deltaKb = Math.abs(distInitialJsGzipKb - sourceInitialJsGzipKb);
  return {
    ok: deltaKb <= 2 && distInitialJsGzipKb <= 250,
    sourceInitialJsGzipKb,
    distInitialJsGzipKb,
    deltaKb,
    maxDeltaKb: 2,
    maxInitialJsGzipKb: 250,
  };
}

/** Child processes must not inherit pnpm's hoisted module lookup. */
export function cleanChildEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.NODE_PATH;
  return { ...env, NO_COLOR: '1', CI: '1' };
}

function commandFor(pm: PackageManager): string {
  return pm === 'pnpm' ? 'pnpm' : 'npm';
}

/**
 * npm installs with its default peer handling (npm 7+ installs peers), as a
 * real consumer would. The one extra flag is `--ignore-scripts`: offline, the
 * harness hands npm the third-party packages as `file:` folders from the pnpm
 * store, and npm runs `prepare` for folder dependencies (it never does for a
 * registry tarball), which needs each package's own build tools.
 */
export function installArgs(pm: PackageManager): string[] {
  return pm === 'pnpm'
    ? ['install', '--offline']
    : ['install', '--offline', '--no-audit', '--no-fund', '--ignore-scripts'];
}

function run(
  command: string,
  args: readonly string[],
  cwd: string,
  options: { timeoutMs?: number; env?: NodeJS.ProcessEnv } = {}
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((done) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...cleanChildEnvironment(), ...options.env },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timeout = options.timeoutMs
      ? setTimeout(() => child.kill('SIGTERM'), options.timeoutMs)
      : undefined;
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.on('error', (error) => done({ code: 1, stdout, stderr: `${stderr}${error.message}` }));
    child.on('close', (code) => {
      if (timeout) clearTimeout(timeout);
      done({ code: code ?? 1, stdout, stderr });
    });
  });
}

function parsePackOutput(output: string, destination: string): string {
  const jsonStart =
    output.lastIndexOf('\n{') >= 0 ? output.lastIndexOf('\n{') + 1 : output.lastIndexOf('\n[') + 1;
  const parsed = JSON.parse(output.slice(jsonStart >= 0 ? jsonStart : 0).trim()) as
    | { filename?: string }
    | { filename?: string }[];
  const filename = Array.isArray(parsed) ? parsed[0]?.filename : parsed.filename;
  if (!filename) throw new Error(`pack did not report a tarball: ${output.trim()}`);
  const path = resolve(filename.startsWith('/') ? filename : join(destination, filename));
  if (!existsSync(path)) throw new Error(`pack reported a missing tarball: ${path}`);
  if (!path.startsWith(`${resolve(destination)}/`)) {
    throw new Error(`pack escaped its staging directory: ${path}`);
  }
  return path;
}

async function pack(directory: string, destination: string): Promise<string> {
  const result = await run(
    'pnpm',
    ['pack', '--pack-destination', destination, '--json'],
    directory
  );
  if (result.code !== 0) {
    throw new Error(`pnpm pack failed in ${relative(REPO, directory)}: ${result.stderr.trim()}`);
  }
  return parsePackOutput(result.stdout, destination);
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function localDependencies(packages: readonly PackedPackage[]): Record<string, string> {
  return Object.fromEntries(packages.map((pkg) => [pkg.name, `file:${pkg.tarball}`]));
}

function installedExternalDependencies(
  root: string,
  packages: readonly PackedPackage[],
  pm: PackageManager
): Record<string, string> {
  const localNames = new Set(packages.map((pkg) => pkg.name));
  const names = new Set<string>();
  for (const pkg of packages) {
    const packageManifest = JSON.parse(
      readFileSync(join(pkg.directory, 'package.json'), 'utf8')
    ) as Record<string, Record<string, string> | undefined>;
    for (const section of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
      for (const name of Object.keys(packageManifest[section] ?? {})) {
        if (!name.startsWith('@protoyard/') && !localNames.has(name)) names.add(name);
      }
    }
  }
  const result = new Map<string, { version: string; directory: string }>();
  const preferNewer = (name: string, version: string, directory: string) => {
    const current = result.get(name);
    if (!current || compareVersions(version, current.version) > 0)
      result.set(name, { version, directory });
  };
  const addCandidate = (name: string, packageJson: string) => {
    if (!existsSync(packageJson) || localNames.has(name)) return;
    const version = (JSON.parse(readFileSync(packageJson, 'utf8')) as { version?: string }).version;
    if (version) preferNewer(name, version, dirname(packageJson));
  };
  for (const name of pm === 'npm' ? new Set<string>() : names) {
    const parts = name.split('/');
    const candidate = join(root, 'node_modules', ...parts, 'package.json');
    addCandidate(name, candidate);
    for (const pkg of packages) {
      const nested = join(pkg.directory, 'node_modules', ...parts, 'package.json');
      addCandidate(name, nested);
    }
  }
  const store = join(root, 'node_modules', '.pnpm');
  if (existsSync(store)) {
    for (const entry of readdirSync(store)) {
      const nestedRoot = join(store, entry, 'node_modules');
      if (!existsSync(nestedRoot)) continue;
      for (const packageName of readdirSync(nestedRoot)) {
        const candidates = packageName.startsWith('@')
          ? readdirSync(join(nestedRoot, packageName)).map((child) =>
              join(nestedRoot, packageName, child, 'package.json')
            )
          : [join(nestedRoot, packageName, 'package.json')];
        for (const candidate of candidates) {
          if (!existsSync(candidate)) continue;
          const packageInfo = JSON.parse(readFileSync(candidate, 'utf8')) as {
            name?: string;
            version?: string;
          };
          if (packageInfo.name && packageInfo.version && !localNames.has(packageInfo.name))
            preferNewer(packageInfo.name, packageInfo.version, dirname(candidate));
        }
      }
    }
  }
  return Object.fromEntries(
    [...result].map(([name, value]) => [
      name,
      pm === 'npm' ? `file:${value.directory}` : value.version,
    ])
  );
}

function compareVersions(left: string, right: string): number {
  const parse = (value: string) => value.split(/[.-]/).map((part) => Number(part) || 0);
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if ((a[index] ?? 0) !== (b[index] ?? 0)) return (a[index] ?? 0) - (b[index] ?? 0);
  }
  return 0;
}

function writePnpmWorkspace(path: string, specs: Record<string, string>, packages: string): void {
  const overrides = Object.entries(specs)
    .map(([name, spec]) => `  '${name}': '${spec.replaceAll("'", "''")}'`)
    .join('\n');
  writeFileSync(path, `${packages}\noverrides:\n${overrides}\nallowBuilds:\n  esbuild: true\n`);
}

async function runJsonCli(
  cli: string,
  args: readonly string[],
  cwd: string,
  name: string
): Promise<{ step: { name: string; ok: boolean; detail?: string }; data?: unknown }> {
  const result = await run(process.execPath, [cli, '--json', ...args], cwd, { timeoutMs: 900_000 });
  type JsonEnvelope = { ok?: boolean; data?: unknown; error?: { message?: string } };
  let envelope: JsonEnvelope | undefined;
  try {
    envelope = JSON.parse(result.stdout.trim()) as JsonEnvelope;
  } catch {
    // The detail below includes stderr but never dumps a full environment.
  }
  const ok = result.code === 0 && envelope?.ok === true;
  const detail = envelope?.error?.message ?? (result.stderr.trim() || result.stdout.trim());
  return {
    step: { name, ok, ...(ok ? {} : { detail }) },
    ...(envelope?.data === undefined ? {} : { data: envelope.data }),
  };
}

async function runSourceJsonCli(
  root: string,
  args: readonly string[],
  name: string
): Promise<{ step: { name: string; ok: boolean; detail?: string }; data?: unknown }> {
  const result = await run(
    process.execPath,
    ['--import', 'tsx', join(root, 'packages', 'cli', 'src', 'bin.ts'), '--json', ...args],
    root,
    { timeoutMs: 900_000 }
  );
  type JsonEnvelope = { ok?: boolean; data?: unknown; error?: { message?: string } };
  let envelope: JsonEnvelope | undefined;
  try {
    envelope = JSON.parse(result.stdout.trim()) as JsonEnvelope;
  } catch {
    // The detail below includes stderr but never dumps a full environment.
  }
  const ok = result.code === 0 && envelope?.ok === true;
  const detail = envelope?.error?.message ?? (result.stderr.trim() || result.stdout.trim());
  return {
    step: { name, ok, ...(ok ? {} : { detail }) },
    ...(envelope?.data === undefined ? {} : { data: envelope.data }),
  };
}

function initialJsGzipKb(data: unknown): number | undefined {
  if (typeof data !== 'object' || data === null || !('results' in data)) return undefined;
  const results = (data as { results?: unknown }).results;
  if (!Array.isArray(results)) return undefined;
  const metrics = (results[0] as { metrics?: unknown } | undefined)?.metrics;
  if (!Array.isArray(metrics)) return undefined;
  const metric = metrics.find(
    (item): item is { metric: string; value: number } =>
      typeof item === 'object' &&
      item !== null &&
      'metric' in item &&
      item.metric === 'initialJsGzip' &&
      'value' in item &&
      typeof item.value === 'number' &&
      Number.isFinite(item.value)
  );
  return metric?.value;
}

async function verifyBudgetParity(
  root: string,
  cli: string,
  consumer: string,
  steps: VerifyResult['steps']
): Promise<void> {
  const distBudget = await runJsonCli(
    cli,
    ['budget', 'second-app', '--skip-build'],
    consumer,
    'scaffolded dist prototype budget'
  );
  const distValue = initialJsGzipKb(distBudget.data);
  steps.push({
    ...distBudget.step,
    ok: distBudget.step.ok && distValue !== undefined,
    ...(distValue === undefined
      ? { detail: distBudget.step.detail ?? 'budget did not report initial JS gzip' }
      : { detail: `initial JS gzip ${distValue.toFixed(2)} KB` }),
  });
  if (distValue === undefined) return;

  const baselineSlug = `dist-parity-${randomUUID()}`;
  const baselineDirectory = join(root, 'prototypes', baselineSlug);
  const baselineArtifact = join(root, 'artifacts', baselineSlug);
  if (existsSync(baselineDirectory) || existsSync(baselineArtifact))
    throw new Error(`refusing to overwrite existing parity fixture ${baselineSlug}`);
  let scaffolded = false;
  try {
    const scaffold = await runSourceJsonCli(
      root,
      ['new', baselineSlug, '--template', 'blank', '--no-install'],
      'source template scaffold'
    );
    steps.push(scaffold.step);
    scaffolded = scaffold.step.ok;
    if (!scaffolded) return;

    // Reuse the installed workspace links from the source blank template so
    // the source comparison needs no install and never touches the lockfile.
    symlinkSync(
      join(root, 'templates', 'blank', 'node_modules'),
      join(baselineDirectory, 'node_modules'),
      'dir'
    );

    const sourceBudget = await runSourceJsonCli(
      root,
      ['budget', baselineSlug],
      'source template budget'
    );
    const sourceValue = initialJsGzipKb(sourceBudget.data);
    steps.push({
      ...sourceBudget.step,
      ok: sourceBudget.step.ok && sourceValue !== undefined,
      ...(sourceValue === undefined
        ? { detail: sourceBudget.step.detail ?? 'budget did not report initial JS gzip' }
        : { detail: `initial JS gzip ${sourceValue.toFixed(2)} KB` }),
    });
    if (sourceValue === undefined) return;

    const parity = compareBudgetParity(sourceValue, distValue);
    steps.push({
      name: 'dist/source initial JS budget parity',
      ok: parity.ok,
      detail: `source ${parity.sourceInitialJsGzipKb.toFixed(2)} KB; dist ${parity.distInitialJsGzipKb.toFixed(2)} KB; delta ${parity.deltaKb.toFixed(2)} KB (max ${parity.maxDeltaKb} KB); cap ${parity.maxInitialJsGzipKb} KB`,
    });
  } finally {
    if (scaffolded) rmSync(baselineDirectory, { recursive: true, force: true });
    rmSync(baselineArtifact, { recursive: true, force: true });
  }
}

/** Runs a long-lived JSON command until its envelope is printed, then stops it. */
async function runJsonEnvelope(
  cli: string,
  args: readonly string[],
  cwd: string,
  name: string
): Promise<{ name: string; ok: boolean; detail?: string }> {
  const result = await new Promise<{ code: number; stdout: string; stderr: string }>((done) => {
    const child = spawn(process.execPath, [cli, '--json', ...args], {
      cwd,
      env: cleanChildEnvironment(),
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      finish({ code: 1, stdout, stderr: `${stderr}timed out waiting for JSON envelope` });
    }, 120_000);
    const finish = (value: { code: number; stdout: string; stderr: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      done(value);
    };
    const inspect = () => {
      try {
        const envelope = JSON.parse(stdout.trim()) as { ok?: boolean };
        if (envelope.ok === true) {
          child.kill('SIGTERM');
          finish({ code: 0, stdout, stderr });
        }
      } catch {
        // The CLI may write the envelope over multiple chunks.
      }
    };
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      inspect();
    });
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.on('error', (error) => finish({ code: 1, stdout, stderr: `${stderr}${error.message}` }));
    child.on('close', (code) => finish({ code: code ?? 1, stdout, stderr }));
  });
  type JsonEnvelope = { ok?: boolean; error?: { message?: string } };
  let envelope: JsonEnvelope | undefined;
  try {
    envelope = JSON.parse(result.stdout.trim()) as JsonEnvelope;
  } catch {
    // The detail below includes stderr but never dumps a full environment.
  }
  const ok = result.code === 0 && envelope?.ok === true;
  const detail = envelope?.error?.message ?? (result.stderr.trim() || result.stdout.trim());
  return { name, ok, ...(ok ? {} : { detail }) };
}

/** Runs the packed CLI's gallery command long enough to receive its envelope. */
async function checkGalleryEnvelope(cli: string, cwd: string) {
  return runJsonEnvelope(
    cli,
    ['gallery', '--port', '49432', '--control-port', '49433'],
    cwd,
    'gallery envelope'
  );
}

async function verifyGalleryBuild(gallery: string, consumer: string, pm: PackageManager) {
  const result = await run(commandFor(pm), ['exec', 'astro', 'build'], gallery, {
    timeoutMs: 900_000,
    env: { PROTOYARD_REGISTRY: join(consumer, '.protoyard', 'registry.json') },
  });
  return {
    name: 'gallery build',
    ok: result.code === 0,
    ...(result.code === 0 ? {} : { detail: result.stderr.trim() || result.stdout.trim() }),
  };
}

export async function verifyPackages(options: VerifyOptions = {}): Promise<VerifyResult> {
  const root = resolve(options.root ?? REPO);
  const pm = options.pm ?? 'pnpm';
  const staging = mkdtempSync(join(tmpdir(), 'protoyard-package-e2e-'));
  const installRoot = mkdtempSync(join(tmpdir(), 'protoyard-package-consumer-'));
  const steps: VerifyResult['steps'] = [];
  try {
    const packed: PackedPackage[] = [];
    for (const directory of packageDirectories(root)) {
      const pkg = manifest(directory);
      if (!pkg.name || !pkg.version) continue;
      const tarball = await pack(directory, staging);
      packed.push({ name: pkg.name, version: pkg.version, directory, tarball });
    }
    if (packed.length === 0) throw new Error('no publishable package manifests found');

    const packageTarballSpecs = localDependencies(packed);
    const externalSpecs = installedExternalDependencies(root, packed, pm);
    const consumerSpecs = { ...packageTarballSpecs, ...externalSpecs };
    writeJson(join(installRoot, 'package.json'), {
      name: 'protoyard-package-e2e-harness',
      private: true,
      type: 'module',
      dependencies: consumerSpecs,
    });
    if (pm === 'pnpm')
      writePnpmWorkspace(join(installRoot, 'pnpm-workspace.yaml'), consumerSpecs, 'packages: []');
    const install = await run(commandFor(pm), installArgs(pm), installRoot, { timeoutMs: 900_000 });
    steps.push({
      name: `${pm} install from tarballs`,
      ok: install.code === 0,
      ...(install.code === 0 ? {} : { detail: install.stderr.trim() || install.stdout.trim() }),
    });
    if (install.code !== 0)
      throw new Error(`${pm} install failed: ${install.stderr.trim() || install.stdout.trim()}`);

    const createBin = join(
      installRoot,
      'node_modules',
      'create-protoyard',
      'bin',
      'create-protoyard.mjs'
    );
    const create = await run(
      process.execPath,
      [createBin, 'workspace', '--pm', pm, '--no-install', '--no-git', '--json'],
      installRoot,
      { timeoutMs: 900_000 }
    );
    let createEnvelope: { ok?: boolean } | undefined;
    try {
      createEnvelope = JSON.parse(create.stdout.trim()) as { ok?: boolean };
    } catch {
      // handled by the step detail
    }
    const consumer = join(installRoot, 'workspace');
    steps.push({
      name: 'create-protoyard envelope',
      ok: create.code === 0 && createEnvelope?.ok === true && existsSync(consumer),
      ...(create.code === 0 && createEnvelope?.ok === true
        ? {}
        : { detail: create.stderr.trim() || create.stdout.trim() }),
    });
    if (create.code !== 0 || !existsSync(consumer)) throw new Error('create-protoyard failed');

    const consumerPackagePath = join(consumer, 'package.json');
    const consumerPackage = JSON.parse(readFileSync(consumerPackagePath, 'utf8')) as Record<
      string,
      unknown
    >;
    consumerPackage.dependencies = {
      ...(consumerPackage.dependencies as Record<string, string> | undefined),
      ...consumerSpecs,
    };
    delete consumerPackage.devDependencies;
    writeJson(consumerPackagePath, consumerPackage);
    if (pm === 'pnpm')
      writePnpmWorkspace(
        join(consumer, 'pnpm-workspace.yaml'),
        consumerSpecs,
        'packages:\n  - prototypes/*'
      );
    const consumerInstall = await run(commandFor(pm), installArgs(pm), consumer, {
      timeoutMs: 900_000,
    });
    steps.push({
      name: `${pm} consumer install from tarballs`,
      ok: consumerInstall.code === 0,
      ...(consumerInstall.code === 0
        ? {}
        : { detail: consumerInstall.stderr.trim() || consumerInstall.stdout.trim() }),
    });
    if (consumerInstall.code !== 0)
      throw new Error(
        `${pm} consumer install failed: ${consumerInstall.stderr.trim() || consumerInstall.stdout.trim()}`
      );

    const cli = join(consumer, 'node_modules', 'protoyard', 'bin', 'protoyard.mjs');
    for (const [name, args] of [
      ['new', ['new', 'second-app', '--template', 'blank', '--no-install']],
      ['validate --build', ['validate', 'second-app', '--build']],
      ['export', ['export', 'second-app']],
      ['index', ['index']],
    ] as const) {
      const checked = await runJsonCli(cli, args, consumer, name);
      steps.push(checked.step);
      if (!checked.step.ok) throw new Error(`${name} failed`);
    }
    if (options.budgetParity) await verifyBudgetParity(root, cli, consumer, steps);
    steps.push(await checkGalleryEnvelope(cli, consumer));
    steps.push(
      await verifyGalleryBuild(
        join(consumer, 'node_modules', '@protoyard', 'gallery'),
        consumer,
        pm
      )
    );
    return {
      ok: steps.every((step) => step.ok),
      packageManager: pm,
      root,
      consumer,
      packages: packed.map((pkg) => pkg.name),
      steps,
    };
  } finally {
    if (!options.keep) {
      rmSync(staging, { recursive: true, force: true });
      rmSync(installRoot, { recursive: true, force: true });
    }
  }
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  let options: VerifyOptions | undefined;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`verify-packages: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
  if (options) {
    verifyPackages(options)
      .then((result) => {
        for (const step of result.steps)
          console.log(
            `${step.ok ? 'pass' : 'fail'} ${step.name}${step.detail ? ` — ${step.detail}` : ''}`
          );
        if (!result.ok) process.exitCode = 1;
      })
      .catch((error) => {
        console.error(`verify-packages: ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
      });
  }
}
