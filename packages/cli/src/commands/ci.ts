import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  applyCiInit,
  assertWritable,
  CI_DRIFT_STATUSES,
  type CiDriftReport,
  type CiInitPlan,
  type CiTemplatePlaceholders,
  checkCiDrift,
  contentSha256,
  nodeVersionFromEngines,
  parseCiProvider,
  parseDeployTarget,
  parseWorkflowList,
  planCiInit,
  unifiedDiff,
} from '../lib/ci-templates.ts';
import type { CommandResult, Handler } from '../lib/command.ts';
import { flag, opt } from '../lib/command.ts';
import { CliError, mark } from '../lib/output.ts';
import { workspacePaths } from '../lib/paths.ts';
import { loadRegistry } from '../lib/registry.ts';

async function resolvePlaceholders(
  root: string,
  deploy: ReturnType<typeof parseDeployTarget>,
  prototypesOverride?: string
): Promise<CiTemplatePlaceholders> {
  let nodeVersion = nodeVersionFromEngines(undefined);
  try {
    const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as {
      engines?: { node?: string };
    };
    nodeVersion = nodeVersionFromEngines(pkg.engines?.node);
  } catch {
    // Workspace without package.json still gets the default.
  }

  let prototypes = prototypesOverride?.trim() ?? '';
  if (!prototypes) {
    try {
      const registry = await loadRegistry(workspacePaths(root));
      prototypes = registry.entries
        .filter((e) => e.kind === 'prototype')
        .map((e) => e.slug)
        .sort()
        .join(',');
    } catch {
      prototypes = '';
    }
  }

  return {
    NODE_VERSION: nodeVersion,
    PROTOTYPES: prototypes,
    PROVIDER: deploy ?? 'cloudflare',
  };
}

function planData(plan: CiInitPlan, dryRun: boolean, force: boolean) {
  return {
    dryRun,
    force,
    provider: plan.provider,
    deploy: plan.deploy,
    workflows: plan.workflows,
    placeholders: plan.placeholders,
    secrets: plan.secrets,
    manualSteps: plan.manualSteps,
    settingsNote: 'Settings are not changed by this command',
    files: plan.files.map((f) => ({
      id: f.id,
      path: f.relativePath,
      exists: f.exists,
      action: f.exists ? (force || dryRun ? 'overwrite' : 'blocked') : 'create',
      sha256: contentSha256(f.content),
      bytes: Buffer.byteLength(f.content, 'utf8'),
      ...(dryRun
        ? {
            diff: unifiedDiff(f.relativePath, f.previous, f.content),
          }
        : {}),
    })),
  };
}

/** `protoyard ci init` — scaffold versioned workflow templates into the workspace. */
export const ciInitCommand: Handler = async (ctx, _args, options): Promise<CommandResult> => {
  const provider = parseCiProvider(opt(options, 'provider'));
  const workflows = parseWorkflowList(opt(options, 'with'));
  const deploy = parseDeployTarget(opt(options, 'deploy'));
  const dryRun = flag(options, 'dryRun');
  const force = flag(options, 'force');

  const placeholders = await resolvePlaceholders(ctx.root, deploy, opt(options, 'prototypes'));
  const plan = await planCiInit({
    root: ctx.root,
    provider,
    workflows,
    deploy,
    placeholders,
  });

  if (!dryRun) {
    assertWritable(plan, force);
    await applyCiInit(plan, { force });
  }

  const data = planData(plan, dryRun, force);

  return {
    data,
    render(out) {
      const { c } = out;
      const title = dryRun ? 'CI init dry run' : 'CI workflows scaffolded';
      out.always(
        `${mark(c, 'pass')} ${title}: ${c.bold(String(plan.files.length))} file(s) for ${c.cyan(provider)}`
      );
      for (const file of plan.files) {
        const tag = file.exists ? (dryRun || force ? 'update' : 'exists') : 'create';
        out.always(`  ${c.dim(tag.padEnd(6))} ${file.relativePath}`);
        if (dryRun) {
          const diff = unifiedDiff(file.relativePath, file.previous, file.content);
          for (const line of diff.trimEnd().split('\n')) {
            out.info(`    ${c.dim(line)}`);
          }
        }
      }
      out.always('');
      out.always(c.bold('Required secrets (names only — never values):'));
      if (plan.secrets.length === 0) {
        out.always(c.dim('  (none for the selected workflows)'));
      } else {
        for (const name of plan.secrets) out.always(`  - ${c.cyan(name)}`);
      }
      out.always('');
      out.always(c.bold('Manual one-time steps:'));
      for (const step of plan.manualSteps) out.always(`  • ${step}`);
      if (dryRun) {
        out.info(c.dim('\nNothing was written (--dry-run).'));
      } else {
        out.info(c.dim('\nSettings are not changed by this command.'));
      }
    },
  };
};

const DRIFT_LABEL: Record<CiDriftReport['status'], string> = {
  'up-to-date': 'up to date',
  outdated: 'outdated',
  modified: 'locally modified',
  unhashed: 'no hash line',
  unmanaged: 'not a Protoyard template',
};

/**
 * `protoyard ci check` — compares scaffolded workflows with the packaged
 * templates: edited since `ci init` (hash mismatch), or older than the
 * template Protoyard ships now. `--strict` exits 4 on any drift.
 */
export const ciCheckCommand: Handler = async (ctx, _args, options): Promise<CommandResult> => {
  const provider = parseCiProvider(opt(options, 'provider'));
  const files = await checkCiDrift({ root: ctx.root, provider });
  const drift = files.filter((f) => CI_DRIFT_STATUSES.has(f.status));
  const strict = flag(options, 'strict');
  const outdated = files.filter((f) => f.outdated).map((f) => f.id as string);
  return {
    data: {
      provider,
      files,
      upToDate: files.filter((f) => f.status === 'up-to-date').length,
      drift: drift.length,
      strict,
    },
    ...(strict && drift.length > 0
      ? {
          failure: new CliError(
            'validation',
            `${drift.length} scaffolded workflow(s) drifted from the Protoyard templates.`,
            {
              hint: `Review with \`pnpm protoyard ci init --with ${drift.map((f) => f.id).join(',')} --dry-run\`, then re-run with --force to update.`,
            }
          ),
        }
      : {}),
    render(out) {
      const { c } = out;
      if (files.length === 0) {
        out.always(
          'No scaffolded workflows (.github/workflows/protoyard-*.yml). Run `pnpm protoyard ci init`.'
        );
        return;
      }
      for (const f of files) {
        const status: 'pass' | 'warn' | 'skip' =
          f.status === 'up-to-date' ? 'pass' : f.status === 'unmanaged' ? 'skip' : 'warn';
        const versions =
          f.version !== null && f.latestVersion !== null && f.outdated
            ? ` (v${f.version} → v${f.latestVersion} available)`
            : '';
        out.always(`${mark(c, status)} ${f.path.padEnd(42)} ${DRIFT_LABEL[f.status]}${versions}`);
      }
      if (outdated.length > 0)
        out.info(
          c.dim(
            `  Update: pnpm protoyard ci init --with ${outdated.join(',')} --dry-run, then --force.`
          )
        );
      if (drift.length === 0)
        out.always(c.green('All scaffolded workflows match their templates.'));
    },
  };
};
