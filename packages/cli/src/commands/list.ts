import type { CommandResult, Handler } from '../lib/command.ts';
import { flag, opt } from '../lib/command.ts';
import {
  applyListing,
  type ListingConfigResult,
  listingNote,
  readListingConfig,
} from '../lib/listing.ts';
import { CliError, formatTable } from '../lib/output.ts';
import { filterEntries, loadRegistry, type RegistryQuery } from '../lib/registry.ts';

const KINDS = ['prototype', 'template', 'blueprint', 'all'] as const;

export const listCommand: Handler = async (ctx, _args, options): Promise<CommandResult> => {
  const kind = opt(options, 'kind') ?? 'all';
  if (!(KINDS as readonly string[]).includes(kind)) {
    throw new CliError('usage', `--kind must be one of ${KINDS.join(', ')}.`);
  }
  const sort = opt(options, 'sort') ?? 'name';
  if (sort !== 'name' && sort !== 'modified') {
    throw new CliError('usage', '--sort must be "name" or "modified".');
  }
  const query: RegistryQuery = {
    kind: kind as RegistryQuery['kind'],
    sort,
    ...(opt(options, 'tag') ? { tag: opt(options, 'tag') } : {}),
    ...(opt(options, 'search') ? { search: opt(options, 'search') } : {}),
    ...(opt(options, 'category') ? { category: opt(options, 'category') } : {}),
    ...(opt(options, 'platform') ? { platform: opt(options, 'platform') } : {}),
  };
  // `--all` ignores protoyard.workspace.json, like PROTOYARD_LISTING=all.
  const listing: ListingConfigResult = flag(options, 'all')
    ? { rule: null, source: 'all' }
    : readListingConfig(ctx.root);
  if (listing.problem) ctx.out.warn(listing.problem);
  const { registry, hidden } = applyListing(await loadRegistry(ctx.paths), listing.rule);
  const entries = filterEntries(registry.entries, query);
  const note = listingNote(hidden, listing);
  return {
    data: {
      query,
      total: registry.entries.length,
      count: entries.length,
      entries,
      invalid: registry.invalid.length,
      listing: {
        source: listing.source,
        hidden,
        ...(listing.rule ? { categories: listing.rule.categories, kinds: listing.rule.kinds } : {}),
      },
    },
    render(out) {
      const { c } = out;
      if (entries.length === 0) {
        out.always(
          registry.entries.length === 0
            ? hidden > 0
              ? `Nothing listed: ${note}`
              : `No prototypes or templates yet. Create one: ${c.cyan('pnpm protoyard new my-app --template blank')}`
            : 'Nothing matches those filters.'
        );
        if (registry.entries.length > 0 && note) out.info(c.dim(note));
        return;
      }
      out.always(
        formatTable(
          ['NAME', 'SLUG', 'KIND', 'CATEGORY', 'TEMPLATE', 'PLATFORM', 'STATUS', 'SCENARIOS'],
          entries.map((e) => [
            e.name,
            e.slug,
            e.kind,
            e.category,
            e.template ?? '—',
            e.platform,
            e.status,
            String(e.scenarioCount),
          ])
        )
      );
      out.info(c.dim(`\n${entries.length} of ${registry.entries.length} shown.`));
      if (note) out.info(c.dim(note));
      if (registry.invalid.length > 0) {
        out.info(
          c.yellow(
            `${registry.invalid.length} invalid manifest(s) hidden — run \`pnpm protoyard index\`.`
          )
        );
      }
    },
  };
};
