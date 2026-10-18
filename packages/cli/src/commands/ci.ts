import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  applyCiInit,
  assertWritable,
  type CiInitPlan,
  type CiTemplatePlaceholders,
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
import { mark } from '../lib/output.ts';
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
