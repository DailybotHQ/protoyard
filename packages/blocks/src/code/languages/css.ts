import { type Grammar, type GrammarRule, sticky } from '../tokenizer.ts';
import { BLOCK_COMMENT, DOUBLE_QUOTED, SINGLE_QUOTED, WHITESPACE } from './shared.ts';

const COMMON: readonly GrammarRule[] = [
  WHITESPACE,
  BLOCK_COMMENT,
  DOUBLE_QUOTED,
  SINGLE_QUOTED,
  { re: sticky(String.raw`@[\w-]+`), kind: 'keyword' },
];

const NUMBER: GrammarRule = {
  re: sticky(String.raw`-?(?:\d+\.?\d*|\.\d+)(?:%|[A-Za-z]+)?`),
  kind: 'number',
};

/** Selector pieces, shared by the top level and rules nested in a block. */
const SELECTOR: readonly GrammarRule[] = [
  { re: sticky(String.raw`[.#][\w-]+`), kind: 'attr' },
  { re: sticky(String.raw`::?[A-Za-z][\w-]*`), kind: 'keyword' },
  { re: sticky(String.raw`\{`), kind: 'punctuation', next: 'declaration' },
];

/**
 * CSS in four states: selectors (outside a block), declarations (inside a
 * block), the colon after a property, and values. Inside a block, a word
 * followed by `:` is a property unless a `{` follows within 200 characters
 * before any `;` or `}` (then it is a nested selector such as `a:hover {`);
 * the bound keeps scanning linear. After a nested block's `}` the grammar
 * returns to selectors, which still reads the next selector correctly.
 */
export const cssGrammar: Grammar = {
  name: 'css',
  start: 'selector',
  states: {
    selector: [
      ...COMMON,
      ...SELECTOR,
      // Media features such as `(max-width: 600px)`.
      { re: sticky(String.raw`[A-Za-z][\w-]*(?=[ \t]*:[ \t])`), kind: 'property' },
      { re: sticky(String.raw`[A-Za-z][\w-]*|\*`), kind: 'tag' },
      NUMBER,
      { re: sticky(String.raw`[>+~,()[\]=:]|\}`), kind: 'punctuation' },
    ],
    declaration: [
      ...COMMON,
      {
        re: sticky(String.raw`(?:--[\w-]+|-?[A-Za-z][\w-]*)(?=[ \t]*:)(?![^;{}]{0,200}\{)`),
        kind: 'property',
        next: 'colon',
      },
      { re: sticky(String.raw`\}`), kind: 'punctuation', next: 'selector' },
      ...SELECTOR,
      { re: sticky(String.raw`[A-Za-z][\w-]*|\*`), kind: 'tag' },
      { re: sticky(String.raw`[;,>+~()[\]=]`), kind: 'punctuation' },
    ],
    colon: [WHITESPACE, { re: sticky(':'), kind: 'punctuation', next: 'value' }],
    value: [
      ...COMMON,
      { re: sticky(String.raw`#[\da-fA-F]{3,8}(?![\w-])`), kind: 'number' },
      NUMBER,
      { re: sticky('!important'), kind: 'keyword' },
      { re: sticky(String.raw`--[\w-]+`), kind: 'variable' },
      { re: sticky(String.raw`[A-Za-z_-][\w-]*(?=\()`), kind: 'function' },
      { re: sticky(String.raw`[A-Za-z_-][\w-]*`), kind: 'constant' },
      { re: sticky(';'), kind: 'punctuation', next: 'declaration' },
      { re: sticky(String.raw`\}`), kind: 'punctuation', next: 'selector' },
      { re: sticky('[(),/*+:]'), kind: 'punctuation' },
    ],
  },
};
