import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type DesignSystemBinding,
  DesignSystemBindingSchema,
  MANIFEST_FILENAME,
} from '@protoyard/core';
import type { CommandResult, Handler } from '../lib/command.ts';
import { flag } from '../lib/command.ts';
import {
  countByRule,
  type DsViolation,
  loadAllowContext,
  scanPrototypeDesignSystem,
} from '../lib/ds-check/index.ts';
import { CliError, mark } from '../lib/output.ts';
import { hasControlCharacter } from '../lib/paths.ts';
import { loadRegistry } from '../lib/registry.ts';
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

/**
 * `protoyard check ds [slugs...] [--report]`: the locked design system rules
 * (`lib/ds-check`) over each prototype's own `src/` and top-level CSS. When
 * the bound design system has an `allow` section, `ds-not-allowed` and
 * `ds-disabled-value` run too, and the library components the prototype
 * imports are scanned.
 * Without slugs it checks every prototype whose manifest has
 * `designSystem.locked: true`. A violation in a locked prototype fails
 * (`validation`, exit 4). `--report` also checks unlocked prototypes (all of
 * them, or the named ones), lists every violation and never fails. Read-only.
 */
export const checkDsCommand: Handler = async (ctx, args, options): Promise<CommandResult> => {
  const report = flag(options, 'report');
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
      targets.push({ slug: entry.slug, path: entry.path, dir, binding });
    }
  } else {
    const registry = await loadRegistry(ctx.paths);
    for (const entry of registry.entries) {
      if (entry.kind !== 'prototype') continue;
      const dir = join(ctx.root, entry.path);
      const binding = readDesignSystemBinding(dir);
      if (binding?.locked || report)
        targets.push({ slug: entry.slug, path: entry.path, dir, binding });
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
    })),
    violations,
  };
  if (!report && blocking.length > 0) {
    const first = blocking[0] as DsViolation;
    throw new CliError(
      'validation',
      `Locked design system: ${blocking.length} violation(s) in ${data.counts.locked} locked prototype(s).`,
      {
        data,
        hint: `${blocking.slice(0, 3).map(formatDsViolation).join(' · ')} · ${first.wayOut}`,
      }
    );
  }
  return {
    data,
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
      }
    },
  };
};
