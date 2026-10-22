import { describe, expect, it } from 'vitest';
import { contentSelector, parseKinds } from '../bench-player.ts';

describe('player kind benchmark', () => {
  it('accepts each kind once while preserving the requested order', () => {
    expect(parseKinds('deck,app,deck,doc,page')).toEqual(['deck', 'app', 'doc', 'page']);
  });

  it('rejects empty and unknown kind lists', () => {
    expect(() => parseKinds('')).toThrow('--kinds');
    expect(() => parseKinds('app,prototype')).toThrow('--kinds');
  });

  it('uses stable first-content targets for rendered content kinds', () => {
    expect(contentSelector('app')).toBeNull();
    expect(contentSelector('deck')).toBe('[data-py-deck-slide]');
    expect(contentSelector('page')).toBe('[data-py-page-section]');
    expect(contentSelector('doc')).toBe('[data-py-doc-block]');
  });
});
