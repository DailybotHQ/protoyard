import { describe, expect, it } from 'vitest';
import { inlineParts } from '../src/lib/inline.ts';

describe('inlineParts', () => {
  it('keeps bold, italic and code as marks and a link as its text', () => {
    expect(inlineParts('What does a **tone** replace?')).toEqual([
      { text: 'What does a ' },
      { text: 'tone', mark: 'strong' },
      { text: ' replace?' },
    ]);
    expect(inlineParts('Use *one* `npm` [command](https://example.com/cli)')).toEqual([
      { text: 'Use ' },
      { text: 'one', mark: 'em' },
      { text: ' ' },
      { text: 'npm', mark: 'code' },
      { text: ' ' },
      { text: 'command' },
    ]);
  });

  it('leaves plain text, lone asterisks and markup as text', () => {
    expect(inlineParts('2 * 3 = 6')).toEqual([{ text: '2 * 3 = 6' }]);
    expect(inlineParts('<b>bold</b>\nnext')).toEqual([{ text: '<b>bold</b> next' }]);
    expect(inlineParts('')).toEqual([]);
  });
});
