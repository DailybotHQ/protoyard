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
      /** Optional build group name (`engine`), usable as a `--filter`. */
      group?: unknown;
      /** Top-level `dist/` folders another build owns, kept when `dist/` is cleaned. */
      keep?: unknown;
    };
  };
}

export interface WorkspacePackage {
  name: string;
  dir: string;
  manifest: WorkspacePackageJson;
  buildConfig: 'tsc' | 'svelte' | null;
  assets: string[];
  /** `protoyard.build.keep`: `dist/<name>` folders the clean step leaves alone (the player app). */
  keep: string[];
  /** `protoyard.build.group`, when the manifest names one. */
  group: string | null;
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

const KEEP_NAME = /^[a-z0-9][a-z0-9._-]*$/;

function keptDistFolders(name: string, manifest: WorkspacePackageJson): string[] {
  const keep = manifest.protoyard?.build?.keep;
  if (keep === undefined) return [];
  if (
    !Array.isArray(keep) ||
    !keep.every((entry) => typeof entry === 'string' && KEEP_NAME.test(entry))
  ) {
    throw new PackageGraphError(
      `protoyard.build.keep must list top-level dist folder names: ${name}`
    );
  }
  return [...keep];
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
      keep: keptDistFolders(manifest.name, manifest),
      group:
        typeof manifest.protoyard?.build?.group === 'string'
          ? manifest.protoyard.build.group
          : null,
      dependencies: dependencyNames(manifest),
    } satisfies WorkspacePackage;
  });
  return { root, packages, byName: new Map(packages.map((pkg) => [pkg.name, pkg])) };
}

/**
 * Strongly connected components of `dependencies` (Tarjan), each sorted by
 * name. A component with more than one member is a dependency cycle.
 */
export function stronglyConnected(
  dependencies: ReadonlyMap<string, readonly string[]>
): string[][] {
  let index = 0;
  const indices = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];
  const connect = (name: string) => {
    indices.set(name, index);
    lowlink.set(name, index);
    index += 1;
    stack.push(name);
    onStack.add(name);
    for (const dep of dependencies.get(name) ?? []) {
      if (!indices.has(dep)) {
        connect(dep);
        lowlink.set(name, Math.min(lowlink.get(name) ?? 0, lowlink.get(dep) ?? 0));
      } else if (onStack.has(dep)) {
        lowlink.set(name, Math.min(lowlink.get(name) ?? 0, indices.get(dep) ?? 0));
      }
    }
    if (lowlink.get(name) === indices.get(name)) {
      const component: string[] = [];
      let member: string | undefined;
      do {
        member = stack.pop();
        if (member === undefined) break;
        onStack.delete(member);
        component.push(member);
      } while (member !== name);
      components.push(component.sort());
    }
  };
  for (const name of [...dependencies.keys()].sort()) if (!indices.has(name)) connect(name);
  return components;
}

/** Dependency cycles among the selected buildable packages (each sorted by name). */
export function packageCycles(
  graph: PackageGraph,
  selectedNames: ReadonlySet<string> = new Set(graph.packages.map((pkg) => pkg.name))
): string[][] {
  return stronglyConnected(buildableDependencies(graph, selectedNames))
    .filter((component) => component.length > 1)
    .sort((a, b) => (a[0] ?? '').localeCompare(b[0] ?? ''));
}

function buildableDependencies(
  graph: PackageGraph,
  selectedNames: ReadonlySet<string>
): Map<string, string[]> {
  const buildable = graph.packages.filter(
    (pkg) => pkg.buildConfig !== null && selectedNames.has(pkg.name)
  );
  const buildableNames = new Set(buildable.map((pkg) => pkg.name));
  return new Map(
    buildable.map((pkg) => [
      pkg.name,
      pkg.dependencies.filter((dependency) => buildableNames.has(dependency)),
    ])
  );
}

/**
 * Return buildable packages in dependency order, grouped for parallel work.
 * Members of a dependency cycle share one level: inside this repository every
 * workspace import resolves to the dependency's src/, never its dist/, so
 * packages in a cycle do not need each other's build output.
 */
export function packageLevels(
  graph: PackageGraph,
  selectedNames: ReadonlySet<string> = new Set(graph.packages.map((pkg) => pkg.name))
): WorkspacePackage[][] {
  const dependencies = buildableDependencies(graph, selectedNames);
  const components = stronglyConnected(dependencies);
  const componentOf = new Map<string, number>();
  components.forEach((component, i) => {
    for (const name of component) componentOf.set(name, i);
  });
  const levels: WorkspacePackage[][] = [];
  const remaining = new Set(components.map((_, i) => i));
  while (remaining.size > 0) {
    const ready = [...remaining].filter((i) =>
      (components[i] ?? []).every((name) =>
        (dependencies.get(name) ?? []).every((dep) => {
          const owner = componentOf.get(dep);
          return owner === i || owner === undefined || !remaining.has(owner);
        })
      )
    );
    if (ready.length === 0) throw new PackageGraphError('Package dependency order is unresolvable');
    const level = ready
      .flatMap((i) => components[i] ?? [])
      .map((name) => graph.byName.get(name))
      .filter((pkg): pkg is WorkspacePackage => pkg !== undefined)
      .sort((left, right) => left.name.localeCompare(right.name));
    levels.push(level);
    for (const i of ready) remaining.delete(i);
  }
  return levels;
}

/**
 * Group filters: `svelte` selects every package built with svelte-package,
 * `engine` every package built with tsc (unless a package has that name).
 */
const FILTER_GROUPS: Record<string, WorkspacePackage['buildConfig']> = {
  svelte: 'svelte',
  engine: 'tsc',
};

/** Select a package (or a group) and its buildable workspace dependencies for --filter. */
export function selectPackageNames(graph: PackageGraph, filters: readonly string[]): Set<string> {
  if (filters.length === 0) return new Set(graph.packages.map((pkg) => pkg.name));
  const selected = new Set<string>();
  const visit = (name: string) => {
    if (selected.has(name)) return;
    selected.add(name);
    const pkg = graph.byName.get(name);
    for (const dependency of pkg?.dependencies ?? []) {
      if (graph.byName.has(dependency)) visit(dependency);
    }
  };
  for (const filter of filters) {
    const packageMatch = graph.packages.find(
      (pkg) => pkg.name === filter || relative(graph.root, pkg.dir) === filter
    );
    if (packageMatch) {
      visit(packageMatch.name);
      continue;
    }
    // A declared group (`protoyard.build.group`) wins; otherwise `svelte` / `engine`
    // fall back to the build strategy.
    let members = graph.packages.filter((pkg) => pkg.group === filter);
    if (members.length === 0) {
      const group = Object.hasOwn(FILTER_GROUPS, filter) ? FILTER_GROUPS[filter] : undefined;
      if (!group) throw new PackageGraphError(`Unknown package filter: ${filter}`);
      members = graph.packages.filter((pkg) => pkg.buildConfig === group);
    }
    // An empty group would make `--filter <group>` a silent no-op that passes.
    if (members.length === 0) {
      throw new PackageGraphError(`No opted-in packages in the "${filter}" group`);
    }
    for (const pkg of members) visit(pkg.name);
  }
  return selected;
}

/** Compatibility alias for callers that prefer the workspace terminology. */
export const readWorkspaceGraph = readPackageGraph;
