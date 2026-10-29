import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { safeParseAnyBlueprint } from '@protoyard/blueprint';
import {
  type AnyContentBlueprint,
  kindBrandTheme,
  kindDefaultThemeId,
} from '@protoyard/blueprint/kinds';
import type { DeckPatchOperation } from '@protoyard/decks/patch';
import { describe, expect, it } from 'vitest';
import blueprint from '../src/blueprint.json';
import { brandTheme, defaultThemeId } from '../src/brand-theme.ts';
import { canCreateDeckStudio, prefixDeckPatchForBlueprint } from '../src/deck-studio.ts';

describe('deck level-two template', () => {
  it('contains a valid data-only deck blueprint', async () => {
    const parsed = await safeParseAnyBlueprint(blueprint);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect('deck' in parsed.data && parsed.data.deck.slides).toHaveLength(6);
    }
  });

  it('keeps src/brand-theme.ts in step with the blueprint brand', async () => {
    const parsed = await safeParseAnyBlueprint(blueprint);
    if (!parsed.success) throw parsed.error;
    const doc = parsed.data as AnyContentBlueprint;
    // The runtime reads the brand resolved ahead (no palette generator in the first chunk).
    // After changing `brand`, resolve it again: replace these exports with the values below.
    expect(brandTheme, 'src/brand-theme.ts brandTheme is stale').toEqual(kindBrandTheme(doc));
    expect(defaultThemeId, 'src/brand-theme.ts defaultThemeId is stale').toBe(
      kindDefaultThemeId(doc)
    );
  });

  it('creates Studio only when DevTools are built and not explicitly hidden', () => {
    expect(canCreateDeckStudio(true, '')).toBe(true);
    expect(canCreateDeckStudio(true, '?devtools=0')).toBe(false);
    expect(canCreateDeckStudio(false, '')).toBe(false);
  });

  it('targets the deck body when a Studio patch is applied to blueprint.json', () => {
    const patch: DeckPatchOperation[] = [
      { op: 'test', path: '/slides/0/id', value: 'cover' },
      { op: 'replace', path: '/style/aspect', value: '4:3' },
      { op: 'remove', path: '/slides/5/props/footnote' },
    ];
    expect(prefixDeckPatchForBlueprint(patch)).toEqual([
      { op: 'test', path: '/deck/slides/0/id', value: 'cover' },
      { op: 'replace', path: '/deck/style/aspect', value: '4:3' },
      { op: 'remove', path: '/deck/slides/5/props/footnote' },
    ]);
  });

  it('scopes the presenter channel to this prototype, not the shared "deck" default', () => {
    const app = readFileSync(join(import.meta.dirname, '../src/App.svelte'), 'utf8');
    expect(app).toMatch(/<DeckApp\b[^>]*\bnamespace=\{runtime\.manifest\.storage\.namespace\}/);
  });
});
