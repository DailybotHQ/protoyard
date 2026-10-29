import { describe, expect, it } from 'vitest';
import { parseMarkdownDeck } from '../src/markdown.ts';

/**
 * A Markdown slide's `background-*` attributes become an object background in
 * the deck model. The reader keeps it when Protoyard's background spec takes
 * it, and reports it (never drops it silently) when it does not.
 */
function deckWith(attributes: string) {
  return `---
title: Backgrounds
---

<!-- .slide: id=cover ${attributes} -->
# Cover
`;
}

describe('Markdown deck backgrounds', () => {
  it('keeps a palette-token solid, a gradient and a pattern background', () => {
    for (const [attributes, expected] of [
      ['background-color=accent', { kind: 'solid', token: 'accent' }],
      ['background-gradient="dusk, 135deg"', { kind: 'gradient', gradient: 'dusk', angle: 135 }],
      ['background-pattern=grid', { kind: 'pattern', pattern: 'grid' }],
    ] as const) {
      const result = parseMarkdownDeck(deckWith(attributes));
      expect(result.ok, `${attributes}: ${JSON.stringify(result.issues)}`).toBe(true);
      expect(result.deck?.slides[0]?.background, attributes).toEqual(expected);
      expect(result.issues.filter((issue) => issue.code === 'background')).toEqual([]);
    }
  });

  it('reports a background outside the Protoyard spec instead of dropping it silently', () => {
    const result = parseMarkdownDeck(deckWith('background-color="#123456"'));
    expect(result.ok).toBe(true);
    expect(result.deck?.slides[0]?.background).toBeUndefined();
    const issue = result.issues.find((entry) => entry.code === 'background');
    expect(issue?.severity).toBe('warning');
    expect(issue?.path).toEqual(['slides', 0, 'background']);
  });

  it('still keeps a preset id', () => {
    const result = parseMarkdownDeck(deckWith('background=pattern-grid'));
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
    expect(result.deck?.slides[0]?.background).toBe('pattern-grid');
  });
});
