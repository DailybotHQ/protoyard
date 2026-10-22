import { safeParseAnyBlueprint } from '@protoyard/blueprint';
import type { DeckPatchOperation } from '@protoyard/decks/patch';
import { describe, expect, it } from 'vitest';
import blueprint from '../src/blueprint.json';
import { canCreateDeckStudio, prefixDeckPatchForBlueprint } from '../src/deck-studio.ts';

describe('deck level-two template', () => {
  it('contains a valid data-only deck blueprint', async () => {
    const parsed = await safeParseAnyBlueprint(blueprint);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect('deck' in parsed.data && parsed.data.deck.slides).toHaveLength(6);
    }
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
});
