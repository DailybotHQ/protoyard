import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  type AnyBlueprint,
  type BlueprintKind,
  blueprintKind,
  parseAnyBlueprint,
  parseBlueprint,
} from '@protoyard/blueprint';

/**
 * Explorations hold a blueprint of any kind (ADR-036): an app, a deck, a page
 * or a doc. These helpers keep every quick command on one rule: an app parses
 * exactly as before (`parseBlueprint`), a content kind through
 * `parseAnyBlueprint` (its body schema), and each opens its own player page.
 */

/** Parses a stored exploration blueprint (already JSON-parsed); throws when invalid. */
export async function parseQuickBlueprint(value: unknown): Promise<AnyBlueprint> {
  const kind = (value as { kind?: unknown } | null)?.kind;
  if (kind === undefined || kind === 'app') return parseBlueprint(value);
  return parseAnyBlueprint(value);
}

/** The player page that runs each kind (`index.html` runs every kind). */
export const QUICK_PLAYER_PAGES: Readonly<Record<BlueprintKind, string>> = {
  app: 'index.html',
  deck: 'deck.html',
  page: 'page.html',
  doc: 'doc.html',
};

/**
 * The page a launcher opens for `blueprint` in `playerDir`: the kind's own
 * page when the player has it, else `index.html` (a player built before the
 * per-kind pages runs every kind from there).
 */
export function quickPlayerPage(blueprint: AnyBlueprint, playerDir: string): string {
  const page = QUICK_PLAYER_PAGES[blueprintKind(blueprint)];
  return page === 'index.html' || existsSync(join(playerDir, page)) ? page : 'index.html';
}
