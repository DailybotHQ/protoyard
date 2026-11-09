import type { CommandResult, Handler } from '../lib/command.ts';
import { formatTable, mark } from '../lib/output.ts';
import { loadRegistry } from '../lib/registry.ts';

/**
 * `protoyard ds list`: the workspace's design systems from a fresh index,
 * with their approval, component count and bound prototypes (ADR-047). The
 * MCP tool `ds_list` returns the same envelope.
 */
export const dsListCommand: Handler = async (ctx): Promise<CommandResult> => {
  const registry = await loadRegistry(ctx.paths);
  const designSystems = registry.designSystems;
  const issues = registry.designSystemIssues;
  return {
    data: { count: designSystems.length, designSystems, issues },
    render(out) {
      const { c } = out;
      for (const issue of issues) {
        out.warn(`${mark(c, 'fail')} ${issue.path}`);
        for (const error of issue.errors) out.warn(`    ${c.dim(error)}`);
      }
      if (designSystems.length === 0) {
        out.always(
          `No design systems yet. Create one: ${c.cyan('pnpm protoyard ds new my-system --brand "#4f46e5"')}`
        );
        return;
      }
      out.always(
        formatTable(
          ['ID', 'NAME', 'VERSION', 'STATUS', 'LOCKABLE', 'LAYOUT', 'COMPONENTS', 'PROTOTYPES'],
          designSystems.map((ds) => [
            ds.id,
            ds.name,
            ds.version,
            ds.status,
            ds.lockable ? 'yes' : 'no',
            ds.layout,
            String(ds.componentCount),
            ds.boundPrototypes.length === 0
              ? '—'
              : ds.boundPrototypes
                  .map((p) => `${p.slug}@${p.version}${p.locked ? ' (locked)' : ''}`)
                  .join(', '),
          ]),
          { maxWidth: 60 }
        )
      );
      if (issues.length > 0) {
        out.info(c.yellow(`${issues.length} design-system problem(s); see above.`));
      }
    },
  };
};
