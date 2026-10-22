import { describe, expect, it } from 'vitest';
import { deckDebugSource } from '../src/kinds/debug-source.ts';

/** The player names a deck's source in the debug panel's agent reference (T-custom-slides follow-up). */
describe('deckDebugSource', () => {
  it('names a ?src= blueprint file', () => {
    expect(deckDebugSource('?src=./kind-fixtures/protoyard-create-anything.json', 'bp-1')).toEqual({
      kind: 'blueprint',
      value: 'kind-fixtures/protoyard-create-anything.json',
    });
    expect(deckDebugSource('?devtools=0&src=blueprints/decks/example.json', 'bp-1')).toEqual({
      kind: 'blueprint',
      value: 'blueprints/decks/example.json',
    });
  });

  it('names a share link, a picked file or an embed by its content namespace', () => {
    expect(deckDebugSource('', 'bp-3f2a')).toEqual({ kind: 'share', value: 'bp-3f2a' });
    expect(deckDebugSource('?keep=demo', 'bp-3f2a')).toEqual({ kind: 'share', value: 'bp-3f2a' });
  });

  it('never names a URL with a scheme as a file', () => {
    expect(deckDebugSource('?src=https://example.com/deck.json', 'bp-9')).toEqual({
      kind: 'share',
      value: 'bp-9',
    });
    expect(deckDebugSource('?src=javascript:alert(1)', 'bp-9').kind).toBe('share');
  });
});
