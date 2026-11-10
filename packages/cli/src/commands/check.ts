import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  type DesignSystemBinding,
  DesignSystemBindingSchema,
  MANIFEST_FILENAME,
} from '@protoyard/core';
import type { CommandResult, Handler } from '../lib/command.ts';
import { flag, opt } from '../lib/command.ts';
import {
  countByRule,
  type DsViolation,
  loadAllowContext,
  scanPrototypeDesignSystem,
} from '../lib/ds-check/index.ts';
import {
  baselineDocument,
  type DsRenderFinding,
  discoverDeclaredRoutes,
  formatRenderFinding,
  type PlannedRoute,
  parseBaseline,
  parseRouteOption,
} from '../lib/ds-render/index.ts';
import {
  type DsRenderDeps,
  type DsRenderReport,
  type DsRenderTarget,
  realDsRenderDeps,
  renderPrototypes,
} from '../lib/ds-render/run.ts';
import { CliError, mark } from '../lib/output.ts';
import { hasControlCharacter, isInside, toPosixRelative } from '../lib/paths.ts';
import { loadRegistry, type RegistryEntry, writeJsonAtomic } from '../lib/registry.ts';
import { checkAdoption } from '../lib/texuli-adoption.ts';
import { resolveTarget } from '../lib/workspace.ts';

/**
 * `protoyard check texuli`: the Texuli adoption rules over this workspace's
 * `prototypes/`, `templates/`, `packages/` and `apps/` (tests, dist and
 * node_modules skipped). In a consumer workspace, which has no pending lists,
 * every violation fails; `tests/adoption/texuli-exceptions.json` (paths with a
 * reason) is honored when present. Read-only.
 */
export const checkTexuliCommand: Handler = async (ctx, _args, options): Promise<CommandResult> => {
  const raw = options.scope;
  const scopes = (Array.isArray(raw) ? raw : raw === undefined ? [] : [raw]).map((value) => {
    const scope = String(value);
    if (hasControlCharacter(scope) || scope.includes('..')) {
      throw new CliError('unsafe_path', `Unsafe --scope "${scope}".`);
    }
    return scope.replace(/\/$/, '');
  });
  const report = checkAdoption({ root: ctx.root, scopes, strict: flag(options, 'strict') });
  const data = {
    ok: report.ok,
    counts: report.counts,
    problems: report.problems,
    violations: report.violations,
  };
  if (!report.ok) {
    throw new CliError(
      'validation',
      `Texuli adoption: ${report.counts.violations} violation(s) in ${report.counts.files} files.`,
      { data, hint: report.problems.slice(0, 5).join(' · ') }
    );
  }
  return {
    data,
    render(o) {
      const c = report.counts;
      o.always(`✓ Texuli adoption: ${c.files} files, ${c.violations} violations`);
    },
  };
};

interface DsTarget {
  slug: string;
  path: string;
  dir: string;
  binding: DesignSystemBinding | null;
  entry: RegistryEntry;
  /** Named on the command line (render then runs on it even when not locked, in report mode). */
  named: boolean;
}

/** The prototype's design-system binding, read from its protoyard.json (data only). */
export function readDesignSystemBinding(dir: string): DesignSystemBinding | null {
  try {
    const raw = JSON.parse(readFileSync(join(dir, MANIFEST_FILENAME), 'utf8')) as {
      designSystem?: unknown;
    };
    const parsed = DesignSystemBindingSchema.safeParse(raw.designSystem);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** One violation as a line: rule, file:line and message. */
export function formatDsViolation(v: DsViolation): string {
  return `${v.rule} ${v.file}:${v.line} ${v.message}`;
}

/** The render options of `check ds`, validated before anything runs. */
interface RenderOptions {
  render: boolean;
  routes: PlannedRoute[] | undefined;
  baselineFile: string | null;
  baseline: Set<string> | null;
  writeBaseline: string | null;
  rebuild: boolean;
}

/** A file path inside the workspace (baselines live with the code they describe). */
function workspaceFile(root: string, value: string, flagName: string): string {
  if (hasControlCharacter(value) || value.trim() === '') {
    throw new CliError('unsafe_path', `Unsafe ${flagName} "${value}".`);
  }
  const file = resolve(root, value);
  if (!isInside(root, file)) {
    throw new CliError('unsafe_path', `${flagName} must be a file inside the workspace.`, {
      hint: `Got ${value}; use a path such as design-systems/ds-render-baseline.json.`,
    });
  }
  return file;
}

/** The most bytes a baseline file may hold. */
const MAX_BASELINE_BYTES = 5 * 1024 * 1024;

function readRenderOptions(
  root: string,
  args: readonly string[],
  options: Record<string, unknown>
): RenderOptions {
  const render = flag(options, 'render');
  const rawRoutes = options.route;
  const routeValues = (
    Array.isArray(rawRoutes) ? rawRoutes : rawRoutes === undefined ? [] : [rawRoutes]
  ).map(String);
  const baselineValue = opt(options, 'baseline');
  const writeValue = opt(options, 'writeBaseline');
  const rebuild = flag(options, 'rebuild');
  if (!render) {
    const needs = [
      routeValues.length > 0 ? '--route' : null,
      baselineValue !== undefined ? '--baseline' : null,
      writeValue !== undefined ? '--write-baseline' : null,
      rebuild ? '--rebuild' : null,
    ].filter(Boolean);
    if (needs.length > 0)
      throw new CliError(
        'usage',
        `${needs.join(', ')} ${needs.length === 1 ? 'needs' : 'need'} --render.`
      );
    return {
      render,
      routes: undefined,
      baselineFile: null,
      baseline: null,
      writeBaseline: null,
      rebuild,
    };
  }
  let routes: PlannedRoute[] | undefined;
  if (routeValues.length > 0) {
    if (args.length === 0)
      throw new CliError('usage', '--route needs the prototype slugs it applies to.', {
        hint: 'For example: protoyard check ds my-app --render --route /settings',
      });
    try {
      routes = parseRouteOption(routeValues);
    } catch (error) {
      throw new CliError('usage', (error as Error).message);
    }
  }
  let baseline: Set<string> | null = null;
  let baselineFile: string | null = null;
  if (baselineValue !== undefined) {
    baselineFile = workspaceFile(root, baselineValue, '--baseline');
    if (!existsSync(baselineFile))
      throw new CliError('not_found', `Baseline ${baselineValue} does not exist.`, {
        hint: 'Write one with --write-baseline <file> (or save the --json output of a --report run).',
      });
    if (statSync(baselineFile).size > MAX_BASELINE_BYTES)
      throw new CliError('validation', `Baseline ${baselineValue} is over 5 MB.`);
    try {
      baseline = parseBaseline(JSON.parse(readFileSync(baselineFile, 'utf8')));
    } catch (error) {
      throw new CliError('validation', `Baseline ${baselineValue}: ${(error as Error).message}`);
    }
  }
  const writeBaseline =
    writeValue === undefined ? null : workspaceFile(root, writeValue, '--write-baseline');
  return { render, routes, baselineFile, baseline, writeBaseline, rebuild };
}

/**
 * `protoyard check ds [slugs...] [--report]`: the locked design system rules
 * (`lib/ds-check`) over each prototype's own `src/` and top-level CSS. When
 * the bound design system has an `allow` section, `ds-not-allowed` and
 * `ds-disabled-value` run too, and the library components the prototype
 * imports are scanned.
 * Without slugs it checks every prototype whose manifest has
 * `designSystem.locked: true`. A violation in a locked prototype fails
 * (`validation`, exit 4). `--report` also checks unlocked prototypes (all of
 * them, or the named ones), lists every violation and never fails.
 *
 * `--render` adds the runtime check (`lib/ds-render`): each locked prototype
 * (and, in report mode, a named prototype bound to a design system) is built
 * or a fresh build reused, served on loopback and checked in Chromium on
 * every route, light and dark, phone and desktop. `--baseline <file>` lets
 * the findings it lists pass; `--write-baseline <file>` saves the current
 * ones. Read-only apart from the build output and `--write-baseline`.
 */
/** The handler with its render dependencies injected (tests pass fakes). */
export function createCheckDsCommand(
  renderDeps: (ctx: Parameters<Handler>[0], options: { rebuild: boolean }) => DsRenderDeps
): Handler {
  return (ctx, args, options) => checkDs(ctx, args, options, renderDeps);
}

export const checkDsCommand: Handler = createCheckDsCommand(realDsRenderDeps);

async function checkDs(
  ctx: Parameters<Handler>[0],
  args: string[],
  options: Record<string, unknown>,
  renderDeps: (ctx: Parameters<Handler>[0], options: { rebuild: boolean }) => DsRenderDeps
): Promise<CommandResult> {
  const report = flag(options, 'report');
  const renderOptions = readRenderOptions(ctx.root, args, options);
  const targets: DsTarget[] = [];
  if (args.length > 0) {
    const seen = new Set<string>();
    for (const raw of args) {
      const { entry, dir } = await resolveTarget(ctx, raw, 'prototype');
      if (seen.has(entry.slug)) continue;
      seen.add(entry.slug);
      const binding = readDesignSystemBinding(dir);
      if (!binding?.locked && !report) {
        throw new CliError(
          'usage',
          `Prototype "${entry.slug}" is not locked to a design system (designSystem.locked is not true in its protoyard.json).`,
          {
            hint: `Run \`protoyard check ds ${entry.slug} --report\` to list what locking it would flag.`,
          }
        );
      }
      targets.push({ slug: entry.slug, path: entry.path, dir, binding, entry, named: true });
    }
  } else {
    const registry = await loadRegistry(ctx.paths);
    for (const entry of registry.entries) {
      if (entry.kind !== 'prototype') continue;
      const dir = join(ctx.root, entry.path);
      const binding = readDesignSystemBinding(dir);
      if (binding?.locked || report)
        targets.push({ slug: entry.slug, path: entry.path, dir, binding, entry, named: false });
    }
  }

  // The allow rules need the bound design system's allow section; it is read
  // once per design system (a binding without one gets the static rules only).
  const contexts = new Map<string, ReturnType<typeof loadAllowContext>>();
  const allowFor = (id: string) => {
    if (!contexts.has(id)) contexts.set(id, loadAllowContext(ctx.root, id));
    return contexts.get(id) ?? null;
  };
  const prototypes = targets.map((t) => {
    const scan = scanPrototypeDesignSystem(ctx.root, t.dir, {
      ...(t.binding ? { designSystemId: t.binding.id, allow: allowFor(t.binding.id) } : {}),
    });
    return { target: t, scan };
  });
  const violations = prototypes.flatMap(({ target, scan }) =>
    scan.violations.map((v) => ({
      ...v,
      slug: target.slug,
      locked: target.binding?.locked === true,
    }))
  );
  const blocking = violations.filter((v) => v.locked);
  const data = {
    ok: blocking.length === 0,
    report,
    counts: {
      prototypes: prototypes.length,
      locked: targets.filter((t) => t.binding?.locked).length,
      files: prototypes.reduce((n, p) => n + p.scan.files.length, 0),
      violations: violations.length,
      blocking: blocking.length,
      byRule: countByRule(violations),
    },
    prototypes: prototypes.map(({ target, scan }) => ({
      slug: target.slug,
      path: target.path,
      locked: target.binding?.locked === true,
      designSystem: target.binding?.id ?? null,
      files: scan.files.length,
      violations: scan.violations.length,
      unchecked: scan.unchecked,
    })),
    violations,
  };
  // The render pass: locked prototypes, and in report mode the named ones bound to a design system.
  let render: (DsRenderReport & { skipped: { slug: string; reason: string }[] }) | null = null;
  if (renderOptions.render) {
    const skipped: { slug: string; reason: string }[] = [];
    const renderTargets: DsRenderTarget[] = [];
    for (const t of targets) {
      if (!t.binding) {
        if (t.named) skipped.push({ slug: t.slug, reason: 'not bound to a design system' });
        continue;
      }
      if (!t.binding.locked && !t.named) continue;
      renderTargets.push({
        slug: t.slug,
        entry: t.entry,
        dir: t.dir,
        designSystemId: t.binding.id,
        locked: t.binding.locked === true,
        declared: discoverDeclaredRoutes(ctx.root, t.dir),
      });
    }
    const result = await renderPrototypes(
      renderTargets,
      renderDeps(ctx, { rebuild: renderOptions.rebuild }),
      {
        ...(renderOptions.routes ? { routes: renderOptions.routes } : {}),
        baseline: renderOptions.baseline,
        onPrototype: (slug) => ctx.out.info(ctx.out.c.dim(`  render check: ${slug}…`)),
      }
    );
    render = { ...result, skipped };
    if (renderOptions.writeBaseline) {
      await writeJsonAtomic(renderOptions.writeBaseline, baselineDocument(result.findings));
    }
  }
  const lockedSlugs = new Set(targets.filter((t) => t.binding?.locked).map((t) => t.slug));
  const renderBlocking: DsRenderFinding[] = render
    ? render.findings.filter((f) => !f.baselined && lockedSlugs.has(f.slug))
    : [];
  const fullData = {
    ...data,
    ok: blocking.length === 0 && renderBlocking.length === 0,
    ...(render
      ? {
          render: {
            ...render,
            ok: renderBlocking.length === 0,
            blocking: renderBlocking.length,
            baseline: renderOptions.baselineFile
              ? toPosixRelative(ctx.root, renderOptions.baselineFile)
              : null,
            wroteBaseline: renderOptions.writeBaseline
              ? toPosixRelative(ctx.root, renderOptions.writeBaseline)
              : null,
          },
        }
      : {}),
  };
  if (!report && (blocking.length > 0 || renderBlocking.length > 0)) {
    const parts: string[] = [];
    if (blocking.length > 0) parts.push(`${blocking.length} static violation(s)`);
    if (renderBlocking.length > 0) parts.push(`${renderBlocking.length} render finding(s)`);
    const first = blocking[0];
    const firstRender = renderBlocking[0];
    const hint = [
      ...blocking.slice(0, 3).map(formatDsViolation),
      ...renderBlocking.slice(0, 3).map(formatRenderFinding),
      first?.wayOut ?? firstRender?.wayOut ?? '',
    ]
      .filter(Boolean)
      .join(' · ');
    throw new CliError(
      'validation',
      `Locked design system: ${parts.join(' and ')} in ${data.counts.locked} locked prototype(s).`,
      { data: fullData, hint }
    );
  }
  return {
    data: fullData,
    render(o) {
      const { c } = o;
      if (prototypes.length === 0) {
        o.always(
          'No locked prototypes (designSystem.locked) to check. Use --report to check unlocked ones.'
        );
        return;
      }
      for (const { target, scan } of prototypes) {
        const label = target.binding?.locked ? `locked to ${target.binding.id}` : 'not locked';
        o.always(
          `${mark(c, scan.violations.length === 0 ? 'pass' : target.binding?.locked ? 'fail' : 'warn')} ${target.slug} ${c.dim(`(${label}, ${scan.files.length} files, ${scan.violations.length} violations)`)}`
        );
        for (const v of scan.violations) o.always(`    ${formatDsViolation(v)}`);
        if (scan.violations.length > 0) o.always(`    ${c.dim(scan.violations[0]?.wayOut ?? '')}`);
        if (scan.unchecked.count > 0) {
          o.always(
            `    ${c.dim(`not checked (${scan.unchecked.count} imports outside the scan; their styling is invisible to check ds): ${scan.unchecked.imports.join(', ')}`)}`
          );
        }
      }
      if (!render) return;
      for (const p of render.prototypes) {
        const findings = render.findings.filter((f) => f.slug === p.slug);
        const status = p.fresh === 0 ? 'pass' : p.locked && !report ? 'fail' : 'warn';
        const baselined = findings.length - p.fresh;
        o.always(
          `${mark(c, status)} ${p.slug} render ${c.dim(`(${p.build ?? 'not built'}, ${p.routes.length} routes × ${render.viewports.length} viewports × ${render.modes.length} modes = ${p.visits} visits, ${findings.length} findings${baselined > 0 ? `, ${baselined} in the baseline` : ''})`)}`
        );
        const shown = findings.filter((f) => !f.baselined);
        for (const f of shown.slice(0, 20)) o.always(`    ${formatRenderFinding(f)}`);
        if (shown.length > 20)
          o.always(c.dim(`    … ${shown.length - 20} more (--json lists every one)`));
        if (shown[0]) o.always(`    ${c.dim(shown[0].wayOut)}`);
        for (const s of p.skipped)
          o.always(
            c.dim(`    skipped route ${s.pattern}${s.file ? ` (${s.file})` : ''}: ${s.reason}`)
          );
      }
      for (const s of render.skipped) o.always(`${mark(c, 'skip')} ${s.slug} render: ${s.reason}`);
      if (render.prototypes.length === 0 && render.skipped.length === 0)
        o.always('No locked prototypes to render.');
      if (render.counts.fixed > 0)
        o.always(
          c.dim(
            `  ${render.counts.fixed} baseline finding(s) no longer occur: refresh the baseline with --write-baseline.`
          )
        );
      if (renderOptions.writeBaseline)
        o.always(
          c.dim(
            `  Wrote the baseline ${toPosixRelative(ctx.root, renderOptions.writeBaseline)} (${render.findings.length} findings).`
          )
        );
    },
  };
}
