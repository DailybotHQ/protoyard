import { ChartSpecSchema } from '@protoyard/ai/chart';
import { describe, expect, it } from 'vitest';
import { parseUntrustedBlocks, safeParseBlock } from '../src/index.ts';

/**
 * Invisible and direction-changing characters ("Trojan Source"): the schema
 * alone refuses them (CLI `generate` and generated prototypes parse without the
 * untrusted loader), and the untrusted loader strips or converts them first so
 * shared documents still load. Built from code points, never literals.
 */
const c = (code: number) => String.fromCodePoint(code);
const REFUSED = [
  0x061c, // Arabic letter mark
  0x200b, // zero-width space
  0x200e, // left-to-right mark
  0x200f, // right-to-left mark
  0x2028, // line separator
  0x2029, // paragraph separator
  0x202e, // right-to-left override
  0x2060, // word joiner
  0x2066, // left-to-right isolate
  0xfeff, // byte order mark
];

describe('the block schema refuses hidden characters on its own', () => {
  it.each(REFUSED.map((code) => [code.toString(16), code]))(
    'U+%s in plain, markdown and code text',
    (_, code) => {
      const ch = c(code);
      expect(safeParseBlock({ type: 'heading', text: `Plan${ch}A` }).success).toBe(false);
      expect(safeParseBlock({ type: 'text', markdown: `Body${ch}text` }).success).toBe(false);
      expect(safeParseBlock({ type: 'code', lang: 'ts', code: `const a${ch} = 1;` }).success).toBe(
        false
      );
    }
  );

  it('keeps the joiners that emoji and some scripts need', () => {
    const technologist = `${c(0x1f9d1)}${c(0x200d)}${c(0x1f4bb)}`;
    expect(safeParseBlock({ type: 'heading', text: `Team ${technologist}` }).success).toBe(true);
    expect(safeParseBlock({ type: 'heading', text: `a${c(0x200c)}b` }).success).toBe(true);
  });

  it.each(REFUSED.map((code) => [code.toString(16), code]))(
    'refuses U+%s in every chart spec string',
    (_, code) => {
      const ch = c(code);
      const spec = (patch: Record<string, unknown>) =>
        ChartSpecSchema.safeParse({
          kind: 'bar',
          title: 'Weekly',
          labels: ['W1', 'W2'],
          series: [{ label: 'Decks', values: [1, 2] }],
          ...patch,
        }).success;
      expect(spec({ title: `Week${ch}ly` })).toBe(false);
      expect(spec({ description: `Ficti${ch}onal` })).toBe(false);
      expect(spec({ labels: [`W${ch}1`, 'W2'] })).toBe(false);
      expect(spec({ series: [{ label: `De${ch}cks`, values: [1, 2] }] })).toBe(false);
    }
  );

  it('refuses control characters and line breaks in chart labels', () => {
    expect(
      ChartSpecSchema.safeParse({
        kind: 'bar',
        title: 'Weekly',
        labels: [`W${c(0)}1`, 'W\n2'],
        series: [{ label: 'Decks', values: [1, 2] }],
      }).success
    ).toBe(false);
  });
});

describe('the untrusted loader cleans hidden characters before the schema', () => {
  it('turns separators into spaces in one-line text and line breaks in markdown', () => {
    const result = parseUntrustedBlocks([
      { type: 'heading', text: `A${c(0x2028)}B${c(0x200b)}C${c(0x2029)}D` },
      { type: 'text', markdown: `One${c(0x2028)}Two${c(0x2060)}` },
    ]);
    expect(result.success, JSON.stringify(result.issues)).toBe(true);
    if (!result.success) return;
    expect(result.blocks[0]).toMatchObject({ text: 'A BC D' });
    expect(result.blocks[1]).toMatchObject({ markdown: 'One\nTwo' });
  });
});
