import { join } from 'node:path';
import { type AnyBlueprint, blueprintIdentity } from '@protoyard/blueprint';
import { type EarlierBlueprint, historyBlueprints } from '../../lib/quick/history.ts';
import type { QuickRecord } from '../../lib/quick/model.ts';
import { readRecordedBlueprint } from './promote.ts';

/**
 * The storage namespaces that belong to one exploration, for `quick report`
 * and `quick feedback`: the current base blueprint, each recorded variant,
 * and every earlier base blueprint kept in `history/NNNN.json` (a tab that
 * live-reloaded after `quick iterate` keeps its world under the namespace it
 * first opened). Explorations record no `keep-` namespaces, so none count.
 * Any other namespace is foreign.
 */

/** How many history entries are read back (newest first). */
export const QUICK_HISTORY_LOOKBACK = 1024;

export interface ExplorationGroup {
  /** null for the base exploration. */
  variant: string | null;
  label: string;
  blueprint: AnyBlueprint;
  namespace: string;
}

export interface ExplorationNamespaces {
  /** The base first, then the variants in record order. */
  groups: ExplorationGroup[];
  /**
   * Earlier base blueprints, newest change first, one per namespace and none
   * that is also a current group's namespace.
   */
  earlier: EarlierBlueprint[];
  /** A one-line list of the namespaces, for an error hint. */
  hint: string;
}

export async function explorationNamespaces(
  dir: string,
  record: QuickRecord
): Promise<ExplorationNamespaces> {
  const base = await readRecordedBlueprint(join(dir, 'blueprint.json'), record.blueprintSha256);
  const groups: ExplorationGroup[] = [
    {
      variant: null,
      label: `Base: ${base.blueprint.name}`,
      blueprint: base.blueprint,
      namespace: (await blueprintIdentity(base.blueprint)).namespace,
    },
  ];
  for (const variant of record.variants) {
    const loaded = await readRecordedBlueprint(
      join(dir, variant.dir, 'blueprint.json'),
      variant.blueprintSha256
    );
    groups.push({
      variant: variant.id,
      label: `${variant.id}: ${variant.label}`,
      blueprint: loaded.blueprint,
      namespace: (await blueprintIdentity(loaded.blueprint)).namespace,
    });
  }
  const claimed = new Set(groups.map((group) => group.namespace));
  const earlier: EarlierBlueprint[] = [];
  for (const entry of await historyBlueprints(dir, QUICK_HISTORY_LOOKBACK)) {
    if (claimed.has(entry.namespace)) continue;
    claimed.add(entry.namespace);
    earlier.push(entry);
  }
  const hint = [
    ...groups.map((group) => `${group.variant ?? 'base'} ${group.namespace}`),
    ...earlier.map((entry) => `base before change ${entry.sequence} ${entry.namespace}`),
  ].join(', ');
  return { groups, earlier, hint };
}
