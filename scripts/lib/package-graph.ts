import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

export interface WorkspacePackageJson {
  name?: unknown;
  dependencies?: Record<string, unknown>;
  devDependencies?: Record<string, unknown>;
  optionalDependencies?: Record<string, unknown>;
  peerDependencies?: Record<string, unknown>;
  protoyard?: {
    build?: {
      assets?: unknown;
    };
  };
}

export interface WorkspacePackage {
  name: string;
  dir: string;
  manifest: WorkspacePackageJson;
  buildConfig: 'tsc' | 'svelte' | null;
  assets: string[];
  dependencies: string[];
}

export interface PackageGraph {
  root: string;
  packages: WorkspacePackage[];
  byName: Map<string, WorkspacePackage>;
}

export class PackageGraphError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PackageGraphError';
  }
}

function readJson(path: string): WorkspacePackageJson {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as WorkspacePackageJson;
  } catch (error) {
    throw new PackageGraphError(
      `Could not read ${path}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function workspacePatterns(root: string): string[] {
  const workspaceFile = join(root, 'pnpm-workspace.yaml');
  if (!existsSync(workspaceFile)) return ['packages/*', 'apps/*'];
  const source = readFileSync(workspaceFile, 'utf8');
  const patterns: string[] = [];
  let inPackages = false;
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+#.*$/, '').trim();
    const inline = line.match(/^packages:\s*\[([^\]]*)\]$/)?.[1];
    if (inline) {
      patterns.push(
        ...inline
          .split(',')
          .map((value) => value.trim().replace(/^['"]|['"]$/g, ''))
          .filter(Boolean)
      );
      break;
    }
    if (line === 'packages:') {
      inPackages = true;
      continue;
    }
    if (!inPackages) continue;
    const list = line.match(/^[-]\s*["']?([^"']+?)["']?$/)?.[1];
    if (list) {
      patterns.push(list.trim());
      continue;
    }
    if (line && !line.startsWith('-')) break;
  }
  return patterns.length > 0 ? patterns : ['packages/*', 'apps/*'];
}

function globDirectories(root: string, pattern: string): string[] {
  const segments = pattern.replaceAll('\\', '/').split('/').filter(Boolean);
  const found: string[] = [];
  const visit = (base: string, index: number) => {
    if (index === segments.length) {
      if (existsSync(join(base, 'package.json'))) found.push(base);
      return;
    }
    const segment = segments[index];
    if (!segment) return;
    if (segment === '**') {
      visit(base, index + 1);
      if (!existsSync(base)) return;
      for (const entry of readdirSync(base)) {
        const child = join(base, entry);
        if (statSync(child).isDirectory()) visit(child, index);
      }
      return;
    }
    if (!segment.includes('*')) {
      visit(join(base, segment), index + 1);
      return;
    }
    if (!existsSync(base)) return;
    const expression = new RegExp(`^${segment.split('*').map(escapeRegExp).join('.*')}$`);
    for (const entry of readdirSync(base)) {
      const child = join(base, entry);
      if (expression.test(entry) && statSync(child).isDirectory()) visit(child, index + 1);
    }
  };
  visit(root, 0);
  return found;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function dependencyNames(manifest: WorkspacePackageJson): string[] {
  const names = new Set<string>();
  for (const dependencies of [
    manifest.dependencies,
    manifest.devDependencies,
    manifest.optionalDependencies,
    manifest.peerDependencies,
  ]) {
    for (const name of Object.keys(dependencies ?? {})) names.add(name);
  }
  return [...names].sort();
}

function buildConfig(
  root: string,
  manifest: WorkspacePackageJson
): {
  config: WorkspacePackage['buildConfig'];
  assets: string[];
} {
  const rawAssets = manifest.protoyard?.build?.assets;
  if (!Array.isArray(rawAssets) || !rawAssets.every((asset) => typeof asset === 'string')) {
    return { config: null, assets: [] };
  }
  const assets = rawAssets as string[];
  if (existsSync(join(root, 'svelte.config.js'))) return { config: 'svelte', assets };
  if (existsSync(join(root, 'tsconfig.build.json'))) return { config: 'tsc', assets };
  return { config: null, assets };
}

/** Read all package manifests declared by the workspace's package globs. */
export function readPackageGraph(workspaceRoot: string): PackageGraph {
  const root = resolve(workspaceRoot);
  const packageDirs = new Set(
    workspacePatterns(root).flatMap((pattern) => globDirectories(root, pattern))
  );
  const packages = [...packageDirs].sort().map((dir) => {
    const manifest = readJson(join(dir, 'package.json'));
    if (typeof manifest.name !== 'string' || manifest.name.length === 0) {
      throw new PackageGraphError(
        `Package manifest has no name: ${relative(root, dir)}/package.json`
      );
    }
    const build = buildConfig(dir, manifest);
    return {
      name: manifest.name,
      dir,
      manifest,
      buildConfig: build.config,
      assets: build.assets,
      dependencies: dependencyNames(manifest),
    } satisfies WorkspacePackage;
  });
  return { root, packages, byName: new Map(packages.map((pkg) => [pkg.name, pkg])) };
}

/** Return buildable packages in dependency order, grouped for parallel work. */
export function packageLevels(
  graph: PackageGraph,
  selectedNames: ReadonlySet<string> = new Set(graph.packages.map((pkg) => pkg.name))
): WorkspacePackage[][] {
  const buildable = graph.packages.filter(
    (pkg) => pkg.buildConfig !== null && selectedNames.has(pkg.name)
  );
  const buildableNames = new Set(buildable.map((pkg) => pkg.name));
  const dependencies = new Map(
    buildable.map((pkg) => [
      pkg.name,
      pkg.dependencies.filter((dependency) => buildableNames.has(dependency)),
    ])
  );
  const levels: WorkspacePackage[][] = [];
  const remaining = new Set(buildable.map((pkg) => pkg.name));
  while (remaining.size > 0) {
    const level = buildable
      .filter(
        (pkg) =>
          remaining.has(pkg.name) &&
          (dependencies.get(pkg.name) ?? []).every((dep) => !remaining.has(dep))
      )
      .sort((left, right) => left.name.localeCompare(right.name));
    if (level.length === 0) {
      const cycle = [...remaining].sort().join(' -> ');
      throw new PackageGraphError(`Package dependency cycle: ${cycle}`);
    }
    levels.push(level);
    for (const pkg of level) remaining.delete(pkg.name);
  }
  return levels;
}

/** Select a package and its buildable workspace dependencies for --filter. */
export function selectPackageNames(graph: PackageGraph, filters: readonly string[]): Set<string> {
  if (filters.length === 0) return new Set(graph.packages.map((pkg) => pkg.name));
  const selected = new Set<string>();
  for (const filter of filters) {
    const packageMatch = graph.packages.find(
      (pkg) => pkg.name === filter || relative(graph.root, pkg.dir) === filter
    );
    if (!packageMatch) throw new PackageGraphError(`Unknown package filter: ${filter}`);
    const visit = (name: string) => {
      if (selected.has(name)) return;
      selected.add(name);
      const pkg = graph.byName.get(name);
      for (const dependency of pkg?.dependencies ?? []) {
        if (graph.byName.has(dependency)) visit(dependency);
      }
    };
    visit(packageMatch.name);
  }
  return selected;
}

/** Compatibility alias for callers that prefer the workspace terminology. */
export const readWorkspaceGraph = readPackageGraph;
