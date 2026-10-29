import { describe, expect, it } from 'vitest';
import {
  inertJson,
  isInvisibleCodePoint,
  isSafeDeckPath,
  isSafeShareId,
  SAFE_SLUG,
  stripInvisible,
} from '../src/text/index.ts';

/** The one definition of invisible characters and safe deck sources (security review of PLAN_006). */
describe('isInvisibleCodePoint', () => {
  it('covers controls, zero-width, invisible format and bidi characters, but not tab or newlines', () => {
    for (const code of [
      0x00, 0x07, 0x1b, 0x7f, 0x85, 0xad, 0x61c, 0x180e, 0x200b, 0x200e, 0x2028, 0x2029, 0x202a,
      0x202e, 0x2060, 0x2066, 0x2069, 0x206f, 0xfeff, 0xfff9, 0xfffb,
    ]) {
      expect(isInvisibleCodePoint(code), code.toString(16)).toBe(true);
    }
    for (const code of [0x09, 0x0a, 0x0d, 0x20, 0x41, 0xe9, 0x2014, 0x4e2d]) {
      expect(isInvisibleCodePoint(code), code.toString(16)).toBe(false);
    }
  });

  it('is what stripInvisible and inertJson use', () => {
    const hostile = `a${String.fromCodePoint(0x61c)}b${String.fromCodePoint(0xad)}c${String.fromCodePoint(0x202e)}d`;
    expect(stripInvisible(hostile)).toBe('abcd');
    const json = inertJson({ text: hostile });
    expect(json).toContain('\\u061c');
    expect(json).toContain('\\u00ad');
    expect(json).toContain('\\u202e');
    expect(JSON.parse(json)).toEqual({ text: hostile });
  });
});

describe('safe deck sources', () => {
  it('accepts plain relative .json paths only', () => {
    for (const ok of [
      'deck.json',
      'blueprints/decks/example.json',
      'kind-fixtures/a_b-c.v2.json',
    ]) {
      expect(isSafeDeckPath(ok), ok).toBe(true);
    }
    for (const bad of [
      '',
      '/etc/hosts.json',
      '../deck.json',
      'a/../deck.json',
      './deck.json',
      'a//deck.json',
      'deck.txt',
      'deck.json?x',
      'deck.json;curl x|sh',
      'deck $(id).json',
      'C:\\deck.json',
      `${'a/'.repeat(130)}d.json`,
    ]) {
      expect(isSafeDeckPath(bad), bad).toBe(false);
    }
  });

  it('accepts slugs and share ids without shell or path syntax', () => {
    expect(SAFE_SLUG.test('my-deck')).toBe(true);
    expect(SAFE_SLUG.test('My Deck')).toBe(false);
    expect(isSafeShareId('bp-3f2a_9')).toBe(true);
    for (const bad of ['bp-1|sh', 'bp 1', '../bp', '-rf'])
      expect(isSafeShareId(bad), bad).toBe(false);
  });
});
