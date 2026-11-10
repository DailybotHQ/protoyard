/**
 * Orchestration of `check ds --render`: for each prototype, compile its
 * design system, build it (or reuse a fresh build), serve it on loopback,
 * plan the routes, visit route × viewport × mode with the driver, and turn
 * Texuli's reports into findings. The browser, the build and the compile are
 * injected (`DsRenderDeps`), so the orchestration is tested without one;
 * `realDsRenderDeps` wires the real ones.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { DesignSystemAllow } from '@texuli/spec/design-system';
import { artifactDir, BUILD_MANIFEST_FILENAME, buildPrototype } from '../build.ts';
import { buildInputsHash } from '../build-inputs.ts';
import { locateDesignSystem, readDocumentFile } from '../design-systems.ts';
import { dsCatalog, readAllow, readLibrary } from '../ds-catalog.ts';
import { CliError } from '../output.ts';
import type { RegistryEntry } from '../registry.ts';
import { serveStatic } from '../static-server.ts';
import type { CommandContext } from '../workspace.ts';
import type { CompiledRun, DsRenderDriver, DsRenderDriverLaunch } from './browser.ts';
import {
  applyBaseline,
  type DeclaredRoute,
  DS_RENDER_MODES,
  DS_RENDER_VIEWPORTS,
  type DsRenderFinding,
  type DsRenderMode,
  type DsRenderViewport,
  fingerprintOf,
  type PlannedRoute,
  pageErrorFinding,
  planRoutes,
  planVisits,
  type SkippedRoute,
  visitFindings,
  wayOutFor,
} from './index.ts';

export interface DsRenderTarget {
  slug: string;
  entry: RegistryEntry;
  dir: string;
  designSystemId: string;
  locked: boolean;
  /** Routes the prototype declares (`discoverDeclaredRoutes`). */
  declared: readonly DeclaredRoute[];
}

export interface DsRenderCompiled {
  runs: readonly CompiledRun[];
  /** Undefined when the document has no `allow` section (only `unmapped` is checked then). */
  allowManifest: { allow: Record<string, true> } | undefined;
  /** The document's `allow` section, for the axis values (`render-disabled-value`). */
  allow?: DesignSystemAllow | null;
  /** Why it did not compile (empty when it did). */
  errors: readonly string[];
}

export interface DsRenderServed {
  baseUrl: string;
  build: 'built' | 'reused';
  close(): Promise<void>;
}

export interface DsRenderDeps {
  launch(): Promise<DsRenderDriverLaunch>;
  compile(designSystemId: string): Promise<DsRenderCompiled>;
  serve(target: DsRenderTarget): Promise<DsRenderServed>;
}

export interface DsRenderOptions {
  /** Check only these routes (`--route`); no link discovery. */
  routes?: readonly PlannedRoute[];
  baseline?: ReadonlySet<string> | null;
  modes?: readonly DsRenderMode[];
  viewports?: readonly DsRenderViewport[];
  /** Called before each prototype (progress lines). */
  onPrototype?: (slug: string) => void;
}

export interface DsRenderPrototypeReport {
  slug: string;
  designSystem: string;
  locked: boolean;
  build: 'built' | 'reused' | null;
  routes: PlannedRoute[];
  skipped: SkippedRoute[];
  visits: number;
  findings: number;
  /** Findings no baseline lists. */
  fresh: number;
}

export interface DsRenderReport {
  ok: boolean;
  prototypes: DsRenderPrototypeReport[];
  findings: DsRenderFinding[];
  counts: {
    prototypes: number;
    visits: number;
    findings: number;
    fresh: number;
    baselined: number;
    fixed: number;
    byCode: Record<string, number>;
  };
  modes: DsRenderMode[];
  viewports: DsRenderViewport['id'][];
}

async function checkPrototype(
  target: DsRenderTarget,
  driver: DsRenderDriver,
  deps: DsRenderDeps,
  options: DsRenderOptions
): Promise<{ report: Omit<DsRenderPrototypeReport, 'fresh'>; findings: DsRenderFinding[] }> {
  const modes = options.modes ?? DS_RENDER_MODES;
  const viewports = options.viewports ?? DS_RENDER_VIEWPORTS;
  const compiled = await deps.compile(target.designSystemId);
  const report = {
    slug: target.slug,
    designSystem: target.designSystemId,
    locked: target.locked,
    build: null as DsRenderPrototypeReport['build'],
    routes: [] as PlannedRoute[],
    skipped: [] as SkippedRoute[],
    visits: 0,
    findings: 0,
  };
  if (!compiled.runs.some((run) => run.compiled)) {
    const f = {
      slug: target.slug,
      route: '/',
      mode: modes[0] ?? 'light',
      viewport: viewports[0]?.id ?? 'desktop',
      code: 'render-not-compiled',
      selector: 'design-system',
      component: null,
      file: null,
      message: `Design system "${target.designSystemId}" did not compile: ${compiled.errors.slice(0, 3).join(' · ') || 'no compiled run'}.`,
      wayOut: wayOutFor('render-not-compiled'),
    } satisfies Omit<DsRenderFinding, 'fingerprint'>;
    report.findings = 1;
    return { report, findings: [{ ...f, fingerprint: fingerprintOf(f) }] };
  }
  const served = await deps.serve(target);
  report.build = served.build;
  const findings: DsRenderFinding[] = [];
  const links: string[] = [];
  const visited = new Set<string>();
  const visitAll = async (routes: readonly PlannedRoute[]) => {
    for (const visit of planVisits(routes, modes, viewports)) {
      report.visits += 1;
      try {
        const result = await driver.visit({
          baseUrl: served.baseUrl,
          visit,
          runs: compiled.runs,
          allowManifest: compiled.allowManifest ?? {},
        });
        findings.push(
          ...visitFindings(
            target.slug,
            visit,
            result.info,
            result.locked,
            target.designSystemId,
            compiled.allow ?? null
          )
        );
        links.push(...result.info.links);
      } catch (error) {
        findings.push(pageErrorFinding(target.slug, visit, error));
      }
    }
    for (const route of routes) {
      visited.add(route.path);
      report.routes.push(route);
    }
  };
  try {
    if (options.routes && options.routes.length > 0) {
      await visitAll(options.routes);
    } else {
      // Declared static routes first; their links resolve the parameterized
      // patterns and lead to routes the prototype does not declare.
      const first = planRoutes(target.declared, []);
      await visitAll(first.routes);
      const second = planRoutes(target.declared, links);
      await visitAll(second.routes.filter((route) => !visited.has(route.path)));
      report.skipped = second.skipped.filter(
        (s) => !report.routes.some((r) => r.pattern === s.pattern && r.pattern !== null)
      );
    }
  } finally {
    await served.close();
  }
  report.findings = findings.length;
  return { report, findings };
}

/**
 * Run the render check over `targets`. Throws a `CliError` (`failure`) when
 * the browser cannot run: Playwright, its Chromium or `@axe-core/playwright`
 * missing. Findings never throw; the caller decides what fails.
 */
export async function renderPrototypes(
  targets: readonly DsRenderTarget[],
  deps: DsRenderDeps,
  options: DsRenderOptions = {}
): Promise<DsRenderReport> {
  const modes = [...(options.modes ?? DS_RENDER_MODES)];
  const viewports = [...(options.viewports ?? DS_RENDER_VIEWPORTS)];
  const empty: DsRenderReport = {
    ok: true,
    prototypes: [],
    findings: [],
    counts: { prototypes: 0, visits: 0, findings: 0, fresh: 0, baselined: 0, fixed: 0, byCode: {} },
    modes,
    viewports: viewports.map((v) => v.id),
  };
  if (targets.length === 0) return empty;
  const launch = await deps.launch();
  if (!launch.ok) {
    throw new CliError('failure', `check ds --render needs a browser: ${launch.detail}`, {
      hint: 'Install Playwright\'s Chromium with `pnpm test:e2e:install` (or `npx playwright install chromium`); the render check also needs "@playwright/test" and "@axe-core/playwright" as dev dependencies. The static `check ds` runs without them.',
      data: { reason: launch.reason, detail: launch.detail },
    });
  }
  const prototypes: DsRenderPrototypeReport[] = [];
  const all: DsRenderFinding[] = [];
  try {
    for (const target of targets) {
      options.onPrototype?.(target.slug);
      const { report, findings } = await checkPrototype(target, launch.driver, deps, options);
      prototypes.push({ ...report, fresh: 0 });
      all.push(...findings);
    }
  } finally {
    await launch.driver.close();
  }
  const applied = applyBaseline(all, options.baseline ?? null);
  for (const p of prototypes)
    p.fresh = applied.findings.filter((f) => f.slug === p.slug && !f.baselined).length;
  const byCode: Record<string, number> = {};
  for (const f of applied.findings) byCode[f.code] = (byCode[f.code] ?? 0) + 1;
  return {
    ok: applied.fresh === 0,
    prototypes,
    findings: applied.findings,
    counts: {
      prototypes: prototypes.length,
      visits: prototypes.reduce((n, p) => n + p.visits, 0),
      findings: applied.findings.length,
      fresh: applied.fresh,
      baselined: applied.baselined,
      fixed: applied.fixed,
      byCode,
    },
    modes,
    viewports: viewports.map((v) => v.id),
  };
}

// ── the real dependencies ──────────────────────────────────────────────

/** Whether git tracks any file under `dir` (a build committed to the repository). */
export function gitTracksAny(root: string, dir: string): boolean {
  const rel = relative(root, dir).split(sep).join('/');
  if (!rel || rel.startsWith('..')) return false;
  const result = spawnSync('git', ['ls-files', '-z', '--', rel], {
    cwd: root,
    encoding: 'utf8',
    timeout: 10_000,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return result.status === 0 && result.stdout.length > 0;
}

export interface FreshBuildOptions {
  /** Now, in ms (tests pin it). */
  now?: number;
  /** Whether git tracks files under the artifacts folder (tests replace it). */
  tracked?: (root: string, dir: string) => boolean;
}

/**
 * A build in `artifacts/<slug>/` that `check ds --render` may reuse instead
 * of building again, or null. Reused only when its `build-manifest.json`
 * records the inputs hash of what it was built from (`buildInputsHash`: the
 * prototype, `design-systems/` and the root lockfile) and that hash still
 * matches, its `builtAt` is not in the future, it is a plain build (no
 * `target`), and git tracks nothing under it: a build committed to the
 * repository, or planted with a made-up manifest, is never trusted.
 */
export function freshBuild(
  artifacts: string,
  inputs: { root: string; dir: string },
  options: FreshBuildOptions = {}
): { base: string; dist: string } | null {
  const dist = join(artifacts, 'dist');
  const manifestFile = join(artifacts, BUILD_MANIFEST_FILENAME);
  if (!existsSync(join(dist, 'index.html')) || !existsSync(manifestFile)) return null;
  let manifest: { builtAt?: string; base?: string; target?: string; inputsHash?: unknown };
  try {
    manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
  } catch {
    return null;
  }
  const builtAt = Date.parse(manifest.builtAt ?? '');
  if (!Number.isFinite(builtAt) || manifest.target !== undefined) return null;
  if (builtAt > (options.now ?? Date.now())) return null;
  if (typeof manifest.inputsHash !== 'string') return null;
  if (manifest.inputsHash !== buildInputsHash(inputs.root, inputs.dir)) return null;
  if ((options.tracked ?? gitTracksAny)(inputs.root, artifacts)) return null;
  return { base: manifest.base ?? './', dist };
}

/** The real build, serve, compile and browser of `check ds --render`. */
export function realDsRenderDeps(
  ctx: CommandContext,
  options: { rebuild?: boolean } = {}
): DsRenderDeps {
  return {
    async launch() {
      const { launchDsRenderDriver } = await import('./browser.ts');
      return launchDsRenderDriver(ctx.root);
    },
    async compile(designSystemId) {
      let document: unknown;
      try {
        document = readDocumentFile(locateDesignSystem(ctx.root, designSystemId));
      } catch (error) {
        return { runs: [], allowManifest: undefined, errors: [(error as Error).message] };
      }
      const { checkDesignSystem } = await import('@texuli/tools/ds-check');
      const report = await checkDesignSystem(document, {});
      const allow = readAllow(document);
      const { renderAllowManifest } = await import('./index.ts');
      return {
        runs: report.runs,
        allowManifest: allow
          ? renderAllowManifest(dsCatalog(), allow, readLibrary(document))
          : undefined,
        allow,
        errors: report.errors.map((e) => `${e.code} ${e.path}`),
      };
    },
    async serve(target) {
      const artifacts = artifactDir(ctx, target.entry);
      let fresh = options.rebuild
        ? null
        : freshBuild(artifacts, { root: ctx.root, dir: target.dir });
      let build: DsRenderServed['build'] = 'reused';
      if (!fresh) {
        const result = await buildPrototype(ctx, target.entry, target.dir, {});
        fresh = { base: result.manifest.base, dist: result.outDir };
        build = 'built';
      }
      const server = await serveStatic({
        dir: fresh.dist,
        base: fresh.base,
        port: 0,
        host: '127.0.0.1',
        strictPort: true,
      });
      return { baseUrl: server.url, build, close: () => server.close() };
    },
  };
}
