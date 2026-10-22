import { type GrammarRule, sticky } from '../tokenizer.ts';

/**
 * Rules several grammars share. Each opening delimiter always matches: an
 * unterminated single-line string ends at its line break (`$` with the `m`
 * flag), an unterminated block comment or multi-line string at the end of
 * the input (`$` without it). See tokenizer.ts for why that keeps scanning
 * linear.
 */

export const WHITESPACE: GrammarRule = { re: sticky(String.raw`[ \t\r\n]+`), kind: 'plain' };

/** `"…"` on one line, with backslash escapes. */
export const DOUBLE_QUOTED: GrammarRule = {
  re: sticky(String.raw`"(?:[^"\\\n]|\\.?)*(?:"|$)`),
  kind: 'string',
};

/** `'…'` on one line, with backslash escapes. */
export const SINGLE_QUOTED: GrammarRule = {
  re: sticky(String.raw`'(?:[^'\\\n]|\\.?)*(?:'|$)`),
  kind: 'string',
};

/** `/* … *\/`, possibly across lines. */
export const BLOCK_COMMENT: GrammarRule = {
  re: sticky(String.raw`\/\*[\s\S]*?(?:\*\/|(?![\s\S]))`),
  kind: 'comment',
};

/** `// …` to the end of the line. */
export const SLASH_COMMENT: GrammarRule = { re: sticky(String.raw`\/\/[^\n]*`), kind: 'comment' };

/** `# …` at a line start or after whitespace (not `$#` or `a#b`). */
export const HASH_COMMENT: GrammarRule = {
  re: sticky(String.raw`(?<=^|[ \t;|&(])#[^\n]*`),
  kind: 'comment',
};

/** Decimal, hex, octal and binary numbers with `_` separators and exponents. */
export const C_NUMBER: GrammarRule = {
  re: sticky(
    String.raw`0[xX][\da-fA-F_]+n?|0[bB][01_]+n?|0[oO][0-7_]+n?|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?n?|\.\d[\d_]*(?:[eE][+-]?\d+)?`
  ),
  kind: 'number',
};

export const words = (...list: string[]): ReadonlySet<string> => new Set(list);
