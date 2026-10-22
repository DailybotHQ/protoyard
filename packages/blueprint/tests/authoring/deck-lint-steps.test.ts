import { checkDeckStatic } from '@protoyard/decks/quality';
import { safeParseDeck } from '@protoyard/decks/schema';
import { describe, expect, it } from 'vitest';
import { lintDeckStructure } from '../../src/authoring/deck-lint.ts';

const validSteppedDeck = {
  style: {},
  slides: [
    {
      id: 'process',
      layout: 'process-steps',
      props: {
        title: 'A process',
        steps: [
          { title: 'Define', body: 'Set the scope.', step: 1, reveal: 'fade' },
          { title: 'Review', body: 'Check the result.', step: 2, reveal: 'fade-up' },
          { title: 'Ship', body: 'Make it available.', step: 3, reveal: 'fade' },
        ],
      },
      notes: 'Explain why the process works and give an example for each stage.',
    },
  ],
};

describe('deck lint step markers in catalog props', () => {
  it('accepts schema-valid markers in lint and static quality checks', () => {
    const parsed = safeParseDeck(validSteppedDeck);
    expect(parsed.issues).toEqual([]);
    expect(parsed.deck).toBeDefined();

    expect(lintDeckStructure(validSteppedDeck)).toEqual({ valid: true, diagnostics: [] });
    expect(checkDeckStatic(parsed.deck!).issues).toEqual([]);
  });

  it('still rejects invalid layout props', () => {
    const input = {
      style: {},
      slides: [
        {
          id: 'process',
          layout: 'process-steps',
          props: { title: 'A process', steps: [{ title: 'Missing stages' }] },
        },
      ],
    };

    expect(lintDeckStructure(input).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'invalid-layout-props' })
    );

    const raw = input.slides[0] as unknown as Parameters<
      typeof checkDeckStatic
    >[0]['slides'][number];
    expect(checkDeckStatic({ style: {}, slides: [raw] }).issues).toContainEqual(
      expect.objectContaining({ rule: 'layout-props', severity: 'error' })
    );
  });
});
