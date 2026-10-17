import type { CommandResult, Handler } from '../lib/command.ts';
import { opt } from '../lib/command.ts';
import { CliError, formatTable } from '../lib/output.ts';
import { filterEntries, loadRegistry, type RegistryQuery } from '../lib/registry.ts';

const KINDS = ['prototype', 'template', 'all'] as const;

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
  const registry = await loadRegistry(ctx.paths);
  const entries = filterEntries(registry.entries, query);
  return {
    data: {
      query,
      total: registry.entries.length,
      count: entries.length,
      entries,
      invalid: registry.invalid.length,
    },
    render(out) {
      const { c } = out;
      if (entries.length === 0) {
        out.always(
          registry.entries.length === 0
            ? `No prototypes or templates yet. Create one: ${c.cyan('pnpm protoyard new my-app --template blank')}`
            : 'Nothing matches those filters.'
        );
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
