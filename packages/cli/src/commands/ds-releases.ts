import type { Command } from 'commander';
import type { CommandResult, Handler } from '../lib/command.ts';
import { opt } from '../lib/command.ts';
import {
  contentHash,
  type DesignSystemLocation,
  isDesignSystemId,
  locateDesignSystem,
  readDocumentFile,
} from '../lib/design-systems.ts';
import { readDocumentApproval } from '../lib/ds-catalog.ts';
import type { ReleaseRecord } from '../lib/ds-contracts.ts';
import {
  baselineRelease,
  buildRelease,
  changeSummary,
  checkChangelog,
  diffVersions,
  isSemver,
  listReleases,
  releaseLabel,
  type VersionSide,
  type VersionsDiff,
  writeRelease,
} from '../lib/ds-releases.ts';
import { CliError, formatTable, mark } from '../lib/output.ts';

/**
 * Design-system releases (PLAN_013 T-versions):
 *
 * - `ds release <id> [--changelog <text>]` records the approved version as
 *   `design-systems/<id>/releases/<version>.json` (never rewritten).
 *   `ds approve <id> --by <name> --release <semver>` approves and records in
 *   one step.
 * - `ds versions <id>` lists the releases and where the document stands.
 * - `ds diff <id> [<from>] [<to>]` compares two versions (`current` or a
 *   release): tokens through Texuli's `diffDesignSystems`, and the allow,
 *   library and approval changes.
 *
 * Reads and writes the design-system folder only. No MCP tool releases.
 */

type Def = (
  name: string,
  handler: Handler,
  allowNoWorkspace?: boolean
) => (...args: unknown[]) => Promise<void>;

function folder(root: string, id: string | undefined): DesignSystemLocation {
  if (!id || !isDesignSystemId(id)) {
    throw new CliError('usage', 'Provide a design-system id (lowercase kebab-case).');
  }
  const location = locateDesignSystem(root, id);
  if (location.layout !== 'folder') {
    throw new CliError(
      'validation',
      `${location.file} is a flat document; only a folder keeps releases.`,
      {
        hint: `Run \`protoyard ds migrate ${id}\` first.`,
      }
    );
  }
  return location;
}

const releaseRow = (record: ReleaseRecord) => ({
  release: record.release,
  file: releaseLabel(record.designSystem, record.release),
  contentHash: record.contentHash,
  approvedBy: record.approvedBy,
  approvedAt: record.approvedAt,
  changelog: record.changelog,
  components: record.components.length,
});

/** `ds release <id> [--changelog <text>]`: snapshot the approved version. */
export const dsReleaseCommand: Handler = async (ctx, args, options): Promise<CommandResult> => {
  const location = folder(ctx.root, args[0]);
  const id = location.id as string;
  const changelog = checkChangelog(opt(options, 'changelog'));
  const document = readDocumentFile(location);
  const { record, previous } = await buildRelease(location, document, changelog);
  const file = writeRelease(location, record);
  const data = { id, ...releaseRow(record), file, previous: previous?.release ?? null };
  return {
    data,
    render(out) {
      const { c } = out;
      out.always(`${mark(c, 'pass')} Recorded ${c.bold(`${id}@${record.release}`)} in ${file}.`);
      out.always(`  ${record.changelog}`);
      out.always(`  Commit ${file} with the document, in a commit a designer reviews.`);
    },
  };
};

/** `ds versions <id>`: every release, oldest first, and where the document stands. */
export const dsVersionsCommand: Handler = async (ctx, args): Promise<CommandResult> => {
  const location = folder(ctx.root, args[0]);
  const id = location.id as string;
  const document = readDocumentFile(location);
  const { releases, issues } = listReleases(location);
  const hash = contentHash(document);
  const version = String((document as { version?: unknown }).version ?? '');
  const approval = readDocumentApproval(document);
  const released = releases.find((r) => r.release === version && r.contentHash === hash);
  const current = {
    version,
    status: approval?.status ?? 'draft',
    contentHash: hash,
    released: Boolean(released),
    /** The release this document would be compared with (`ds diff`, the kit). */
    baseline:
      baselineRelease(releases, { version, contentHash: hash, current: true })?.release ?? null,
  };
  const data = { id, current, count: releases.length, releases: releases.map(releaseRow), issues };
  return {
    data,
    render(out) {
      const { c } = out;
      for (const issue of issues) out.warn(`${mark(c, 'fail')} ${issue.file}: ${issue.message}`);
      if (releases.length === 0) {
        out.always(
          `${id} has no releases yet. Record one: ${c.cyan(`pnpm protoyard ds release ${id}`)} (after \`ds approve\`).`
        );
      } else {
        out.always(
          formatTable(
            ['RELEASE', 'APPROVED BY', 'APPROVED AT', 'HASH', 'COMPONENTS', 'CHANGELOG'],
            releases.map((r) => [
              r.release,
              r.approvedBy,
              r.approvedAt,
              r.contentHash.slice(0, 12),
              String(r.components.length),
              r.changelog,
            ]),
            { maxWidth: 60 }
          )
        );
      }
      out.always(
        `Current document: ${version} (${current.status}${current.released ? ', released' : ', not released'}).`
      );
    },
  };
};

function resolveSide(
  label: string,
  document: unknown,
  releases: readonly ReleaseRecord[],
  id: string
): VersionSide & { version: string; hash: string; current: boolean } {
  if (label === 'current') {
    return {
      label,
      document,
      version: String((document as { version?: unknown }).version ?? ''),
      hash: contentHash(document),
      current: true,
    };
  }
  if (!isSemver(label)) {
    throw new CliError('usage', `"${label}" is not a release version or \`current\`.`);
  }
  const record = releases.find((r) => r.release === label);
  if (!record) {
    throw new CliError('not_found', `${id} has no release ${label}.`, {
      hint: `List them with \`protoyard ds versions ${id}\`.`,
    });
  }
  return {
    label,
    document: record.document,
    version: record.release,
    hash: record.contentHash,
    current: false,
  };
}

/** `ds diff <id> [<from>] [<to>]`: what changed between two versions. */
export const dsDiffCommand: Handler = async (ctx, args): Promise<CommandResult> => {
  const location = folder(ctx.root, args[0]);
  const id = location.id as string;
  const document = readDocumentFile(location);
  const { releases, issues } = listReleases(location);
  const to = resolveSide(args[2] ?? 'current', document, releases, id);
  let fromLabel = args[1];
  if (fromLabel === undefined) {
    const baseline = baselineRelease(releases, {
      version: to.version,
      contentHash: to.hash,
      current: to.current,
    });
    if (!baseline) {
      throw new CliError('not_found', `${id} has no earlier release to compare ${to.label} with.`, {
        hint: `Record one with \`protoyard ds release ${id}\`, or name both versions.`,
      });
    }
    fromLabel = baseline.release;
  }
  const from = resolveSide(fromLabel, document, releases, id);
  const diff: VersionsDiff = await diffVersions(from, to);
  const summary = changeSummary(diff);
  return {
    data: { id, ...diff, summary, issues },
    render(out) {
      const { c } = out;
      for (const issue of issues) out.warn(`${mark(c, 'fail')} ${issue.file}: ${issue.message}`);
      out.always(
        `${c.bold(`${id} ${diff.from} → ${diff.to}`)}: ${diff.identical ? 'identical' : summary}.`
      );
      const shown = 20;
      for (const t of diff.tokens.tokens.slice(0, shown)) {
        out.always(
          `  ${t.change.padEnd(7)} ${t.mode} ${t.variable}: ${t.before ?? '∅'} → ${t.after ?? '∅'}`
        );
      }
      if (diff.tokens.tokens.length > shown) {
        out.always(
          c.dim(
            `  … ${diff.tokens.tokens.length - shown} more token changes (--json lists every one)`
          )
        );
      }
      for (const r of diff.tokens.contrast) {
        out.always(
          `  ${c.yellow('contrast')} ${r.mode} ${r.foreground} on ${r.background}: ${r.before} → ${r.after} (needs ${r.required})`
        );
      }
      for (const a of diff.allow) {
        out.always(
          a.kind === 'changed'
            ? `  allow   ${a.component}.${a.list}: +[${a.added.join(', ')}] -[${a.removed.join(', ')}]`
            : 'component' in a
              ? `  allow   ${a.kind} ${a.component}`
              : `  allow   ${a.kind}`
        );
      }
      for (const l of diff.library) {
        out.always(
          `  library ${l.kind} ${l.id}${l.fields ? ` (${l.fields.map((f) => f.field).join(', ')})` : ''}`
        );
      }
      for (const a of diff.approval) {
        out.always(`  approval ${a.field}: ${a.before ?? '∅'} → ${a.after ?? '∅'}`);
      }
    },
  };
};

/** Registers `ds release`, `ds versions` and `ds diff` under the `ds` group. */
export function registerDsReleaseCommands(ds: Command, def: Def): void {
  ds.command('release')
    .description(
      'record the approved version as design-systems/<id>/releases/<version>.json (document, content hash, approver, changelog); never rewrites a release'
    )
    .argument('<id>', 'design system id (a folder, approved at its version and unchanged since)')
    .option(
      '--changelog <text>',
      'what changed (one line; default: a summary of the changes since the previous release)'
    )
    .action(def('ds release', dsReleaseCommand));
  ds.command('versions')
    .description(
      "list a design system's releases (oldest first) and whether the current document is released"
    )
    .argument('<id>', 'design system id')
    .action(def('ds versions', dsVersionsCommand));
  ds.command('diff')
    .description(
      'what changed between two versions: tokens (Texuli diff, contrast regressions), allow, library and approval'
    )
    .argument('<id>', 'design system id')
    .argument('[from]', 'a release version or `current` (default: the release before <to>)')
    .argument('[to]', 'a release version or `current` (default: current)')
    .action(def('ds diff', dsDiffCommand));
}
