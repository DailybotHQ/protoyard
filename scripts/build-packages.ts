import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PackageGraphError,
  packageCycles,
  packageLevels,
  readPackageGraph,
  selectPackageNames,
  type WorkspacePackage,
} from './lib/package-graph.ts';

export interface BuildCommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type BuildCommandRunner = (
  command: string,
  args: readonly string[],
  cwd: string
) => Promise<BuildCommandResult>;

export interface BuildPackageOptions {
  root?: string;
  filters?: readonly string[];
  runCommand?: BuildCommandRunner;
}

export interface BuiltPackageResult {
  name: string;
  directory: string;
  strategy: 'tsc' | 'svelte';
  status: 'built' | 'failed';
  assets: string[];
  error?: string;
}

export interface BuildPackagesResult {
  ok: boolean;
  root: string;
  levels: string[][];
  /** Dependency cycles built together in one level (reported, not fatal). */
  cycles: string[][];
  packages: BuiltPackageResult[];
}

const SOURCE_ASSET = /\.(?:[cm]?ts|tsx|js|jsx|svelte)$/i;

function commandRunner(
  command: string,
  args: readonly string[],
  cwd: string
): Promise<BuildCommandResult> {
  return new Promise((resolveResult) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], shell: false });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.on('error', (error) =>
      resolveResult({ code: 1, stdout, stderr: `${stderr}${error.message}` })
    );
    child.on('close', (code) => resolveResult({ code: code ?? 1, stdout, stderr }));
  });
}

function packageCommand(pkg: WorkspacePackage): { args: string[]; strategy: 'tsc' | 'svelte' } {
  if (pkg.buildConfig === 'svelte') {
    // tsconfig.build.json carries rewriteRelativeImportExtensions, so `.ts`
    // imports in .ts and .svelte files point at the emitted `.js`.
    const tsconfig = existsSync(join(pkg.dir, 'tsconfig.build.json'))
      ? ['--tsconfig', 'tsconfig.build.json']
      : [];
    return {
      strategy: 'svelte',
      args: ['exec', 'svelte-package', '--input', 'src', '--output', 'dist', ...tsconfig],
    };
  }
  return { strategy: 'tsc', args: ['exec', 'tsc', '-p', 'tsconfig.build.json'] };
}

function assetDestination(asset: string): string {
  const normalized = asset.replaceAll('\\', '/');
  return normalized.startsWith('src/') ? normalized.slice('src/'.length) : normalized;
}

function copyAssets(pkg: WorkspacePackage): string[] {
  const copied: string[] = [];
  for (const asset of pkg.assets) {
    const source = resolve(pkg.dir, asset);
    const sourceRelative = relative(pkg.dir, source);
    if (isAbsolute(sourceRelative) || sourceRelative.startsWith('..')) {
      throw new PackageGraphError(`Asset escapes package directory: ${pkg.name}/${asset}`);
    }
    if (SOURCE_ASSET.test(asset)) {
      throw new PackageGraphError(
        `Build assets must not contain source code: ${pkg.name}/${asset}`
      );
    }
    if (!existsSync(source))
      throw new PackageGraphError(`Declared asset does not exist: ${pkg.name}/${asset}`);
    const destination = resolve(pkg.dir, 'dist', assetDestination(asset));
    const destinationRelative = relative(join(pkg.dir, 'dist'), destination);
    if (isAbsolute(destinationRelative) || destinationRelative.startsWith('..')) {
      throw new PackageGraphError(`Asset destination escapes dist: ${pkg.name}/${asset}`);
    }
    mkdirSync(resolve(destination, '..'), { recursive: true });
    cpSync(source, destination, { recursive: true });
    copied.push(asset);
  }
  return copied;
}

async function buildOne(
  pkg: WorkspacePackage,
  run: BuildCommandRunner
): Promise<BuiltPackageResult> {
  if (!pkg.buildConfig) throw new PackageGraphError(`Package is not opted in: ${pkg.name}`);
  const { args, strategy } = packageCommand(pkg);
  rmSync(join(pkg.dir, 'dist'), { recursive: true, force: true });
  mkdirSync(join(pkg.dir, 'dist'), { recursive: true });
  const result = await run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', args, pkg.dir);
  if (result.code !== 0) {
    return {
      name: pkg.name,
      directory: pkg.dir,
      strategy,
      status: 'failed',
      assets: [],
      error: result.stderr.trim() || `build exited with code ${result.code}`,
    };
  }
  try {
    const assets = copyAssets(pkg);
    return { name: pkg.name, directory: pkg.dir, strategy, status: 'built', assets };
  } catch (error) {
    return {
      name: pkg.name,
      directory: pkg.dir,
      strategy,
      status: 'failed',
      assets: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Build opted-in workspace packages by dependency level. */
export async function buildPackages(
  options: BuildPackageOptions = {}
): Promise<BuildPackagesResult> {
  const graph = readPackageGraph(options.root ?? process.cwd());
  const selected = selectPackageNames(graph, options.filters ?? []);
  const levels = packageLevels(graph, selected);
  const cycles = packageCycles(graph, selected);
  const run = options.runCommand ?? commandRunner;
  const results: BuiltPackageResult[] = [];
  for (const level of levels) {
    const current = await Promise.all(level.map((pkg) => buildOne(pkg, run)));
    results.push(...current);
    if (current.some((result) => result.status === 'failed')) break;
  }
  return {
    ok: results.every((result) => result.status === 'built'),
    root: graph.root,
    levels: levels.map((level) => level.map((pkg) => pkg.name)),
    cycles,
    packages: results,
  };
}

function parseArgs(args: readonly string[]): {
  root?: string;
  filters: string[];
  json: boolean;
} {
  const filters: string[] = [];
  let root: string | undefined;
  let json = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) throw new PackageGraphError('Missing command option');
    if (arg === '--json') {
      json = true;
    } else if (arg === '--root') {
      root = args[++index];
      if (!root) throw new PackageGraphError('--root needs a directory');
    } else if (arg === '--filter') {
      const value = args[++index];
      if (!value) throw new PackageGraphError('--filter needs a package name');
      filters.push(
        ...value
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean)
      );
    } else if (arg.startsWith('--filter=')) {
      filters.push(
        ...arg
          .slice('--filter='.length)
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean)
      );
    } else {
      throw new PackageGraphError(`Unknown option: ${arg}`);
    }
  }
  return { root, filters, json };
}

export async function main(args = process.argv.slice(2)): Promise<number> {
  let json = false;
  try {
    const parsed = parseArgs(args);
    json = parsed.json;
    const result = await buildPackages(parsed);
    if (json) console.log(JSON.stringify(result));
    else if (result.packages.length === 0) console.log('build-packages: no opted-in packages');
    else {
      for (const cycle of result.cycles) {
        console.log(`note: dependency cycle built as one level: ${cycle.join(' <-> ')}`);
      }
      for (const pkg of result.packages) {
        console.log(`${pkg.status} ${pkg.name} (${pkg.strategy})`);
        if (pkg.error) console.log(`  ${pkg.error.split('\n').slice(0, 20).join('\n  ')}`);
      }
    }
    return result.ok ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (json) console.log(JSON.stringify({ ok: false, error: message }));
    else console.error(`build-packages: ${message}`);
    return 1;
  }
}

const entry = process.argv[1] ? resolve(process.argv[1]) : '';
if (entry === fileURLToPath(import.meta.url)) {
  void main().then((code) => {
    process.exitCode = code;
  });
}
