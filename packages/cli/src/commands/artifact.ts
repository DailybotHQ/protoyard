import type { CommandResult, Handler } from '../lib/command.ts';
import { opt } from '../lib/command.ts';
import { CliError, mark } from '../lib/output.ts';
import {
  latestShareEntries,
  readShareLedger,
  recordArtifactShare,
  shareLedgerPath,
  shareLedgerRelativePath,
} from '../lib/share-ledger.ts';

/** `artifact record <slug> --url <url>` records a returned private Artifact URL. */
export const artifactRecordCommand: Handler = async (
  ctx,
  args,
  options
): Promise<CommandResult> => {
  if (args.length !== 1) throw new CliError('usage', 'Pass exactly one prototype slug.');
  const url = opt(options, 'url');
  if (!url) throw new CliError('usage', 'Pass --url <url>.');
  const entry = await recordArtifactShare(ctx, args[0] ?? '', url);
  return {
    data: { entry, ledger: shareLedgerRelativePath(ctx) },
    render(out) {
      out.always(`${mark(out.c, 'pass')} Recorded ${out.c.bold(entry.slug)} artifact share.`);
      out.always(`  url         ${out.c.cyan(entry.url)}`);
      out.always(`  visibility  ${entry.visibility} at record time`);
      out.always(`  build       ${entry.buildSha256} (${entry.fileCount} files)`);
      out.always(`  ledger      ${shareLedgerRelativePath(ctx)}`);
    },
  };
};

/** `artifact list` shows the last valid ledger entry for each prototype. */
export const artifactListCommand: Handler = async (ctx, args): Promise<CommandResult> => {
  if (args.length > 0) throw new CliError('usage', '`artifact list` takes no arguments.');
  const path = shareLedgerPath(ctx);
  const ledger = await readShareLedger(path);
  const entries = latestShareEntries(ledger.entries);
  return {
    data: {
      entries,
      total: entries.length,
      ledger: shareLedgerRelativePath(ctx),
      skipped: ledger.skipped,
    },
    render(out) {
      if (entries.length === 0) out.always('No artifact shares recorded.');
      for (const entry of entries) {
        out.always(`${mark(out.c, 'pass')} ${entry.slug.padEnd(28)} ${out.c.cyan(entry.url)}`);
      }
      if (ledger.skipped > 0) {
        out.always(out.c.yellow(`! Skipped ${ledger.skipped} unreadable ledger line(s).`));
      }
      out.info(out.c.dim(`Ledger: ${shareLedgerRelativePath(ctx)}`));
    },
  };
};
