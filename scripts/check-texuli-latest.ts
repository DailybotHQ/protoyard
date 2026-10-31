/**
 * `pnpm exec tsx scripts/check-texuli-latest.ts` — Texuli comes from npm, pinned exactly.
 *
 * Reads every workspace manifest (`package.json`, `packages/*`, `apps/*`,
 * `templates/*`, `prototypes/*`) and fails when a `texuli` or `@texuli/*`
 * dependency is not an exact npm version (a `link:`, `file:`, `workspace:`,
 * git URL, tag or range), or when two manifests pin the same package
 * differently. Peer dependencies are ranges by design and are skipped.
 *
 * `--registry` also asks npm for each package's `latest` dist-tag and fails
 * when a pin is behind or ahead of it (the npm CDN can lag a few minutes after
 * a publish; retry before treating that as a defect). Without `--registry` the
 * check is offline and runs inside `pnpm test`.
 *
 * Exit 0 when clean, 1 on any problem, 2 on usage errors.
 *
 *   pnpm exec tsx scripts/check-texuli-latest.ts [--registry] [--json]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)));
const GROUPS = ['packages', 'apps', 'templates', 'prototypes'];
const FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies'] as const;
const EXACT = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export interface Pin {
  manifest: string;
  name: string;
  spec: string;
}

export interface LatestReport {
  ok: boolean;
  problems: string[];
  /** One entry per Texuli package: its pinned versions and, with the registry, npm latest. */
  packages: { name: string; pinned: string[]; latest?: string }[];
}

export function isTexuli(name: string): boolean {
  return name === 'texuli' || name.startsWith('@texuli/');
}

/** Workspace manifests, root first. */
export function manifests(root: string): string[] {
  const out = ['package.json'];
  for (const group of GROUPS) {
    const dir = join(root, group);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).sort()) {
      const file = `${group}/${name}/package.json`;
      if (existsSync(join(root, file))) out.push(file);
    }
  }
  return out;
}

/** Texuli pins of one manifest. Pure; exported for tests. */
export function pinsOf(manifest: string, json: Record<string, unknown>): Pin[] {
  const pins: Pin[] = [];
  for (const field of FIELDS) {
    const deps = json[field];
    if (!deps || typeof deps !== 'object') continue;
    for (const [name, spec] of Object.entries(deps as Record<string, string>)) {
      if (isTexuli(name)) pins.push({ manifest, name, spec });
    }
  }
  return pins;
}

/** Checks pins against each other and, when given, against npm latest. Pure; exported for tests. */
export function checkPins(pins: Pin[], latest?: Map<string, string | undefined>): LatestReport {
  const problems: string[] = [];
  const byName = new Map<string, Set<string>>();
  for (const p of pins) {
    if (!EXACT.test(p.spec))
      problems.push(`${p.manifest}: ${p.name} "${p.spec}" is not an exact npm version`);
    const set = byName.get(p.name) ?? new Set<string>();
    set.add(p.spec);
    byName.set(p.name, set);
  }
  if (pins.length === 0) problems.push('no Texuli dependency found');
  const packages = [...byName.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, specs]) => {
      const pinned = [...specs].sort();
      if (pinned.length > 1) problems.push(`${name} is pinned differently: ${pinned.join(', ')}`);
      if (!latest) return { name, pinned };
      const tag = latest.get(name);
      if (!tag) problems.push(`${name}: npm latest is unknown`);
      else if (pinned.some((v) => v !== tag))
        problems.push(`${name}: pinned ${pinned.join(', ')}, npm latest is ${tag}`);
      return { name, pinned, latest: tag };
    });
  return { ok: problems.length === 0, problems, packages };
}

function npmLatest(name: string): string | undefined {
  try {
    return execFileSync('npm', ['view', name, 'dist-tags.latest'], { encoding: 'utf8' }).trim();
  } catch {
    return undefined;
  }
}

export function checkLatest(root = REPO, registry = false): LatestReport {
  const pins = manifests(root).flatMap((m) =>
    pinsOf(m, JSON.parse(readFileSync(join(root, m), 'utf8')) as Record<string, unknown>)
  );
  const latest = registry
    ? new Map([...new Set(pins.map((p) => p.name))].map((n) => [n, npmLatest(n)]))
    : undefined;
  return checkPins(pins, latest);
}

function main(argv: string[]): number {
  for (const a of argv) {
    if (a !== '--registry' && a !== '--json') {
      console.error(`unknown option ${a}`);
      return 2;
    }
  }
  const report = checkLatest(REPO, argv.includes('--registry'));
  if (argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else {
    for (const p of report.problems) console.log(`✗ ${p}`);
    const where = argv.includes('--registry') ? ', npm latest checked' : '';
    console.log(
      `${report.ok ? '✓' : '✗'} Texuli pins: ${report.packages.length} packages${where}, ${report.problems.length} problem(s)`
    );
  }
  return report.ok ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exit(main(process.argv.slice(2)));
}
