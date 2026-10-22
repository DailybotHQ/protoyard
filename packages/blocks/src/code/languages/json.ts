import { type Grammar, nextNonBlank, sticky } from '../tokenizer.ts';
import { BLOCK_COMMENT, SLASH_COMMENT, WHITESPACE } from './shared.ts';

/** JSON, plus the comments JSONC allows. A string followed by `:` is a property. */
export const jsonGrammar: Grammar = {
  name: 'json',
  start: 'value',
  states: {
    value: [
      WHITESPACE,
      SLASH_COMMENT,
      BLOCK_COMMENT,
      {
        re: sticky(String.raw`"(?:[^"\\\n]|\\.?)*(?:"|$)`),
        kind: (_text, ctx) => (nextNonBlank(ctx.input, ctx.end) === ':' ? 'property' : 'string'),
      },
      { re: sticky(String.raw`-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?`), kind: 'number' },
      {
        re: sticky(String.raw`[A-Za-z_]\w*`),
        kind: (text) =>
          text === 'true' || text === 'false' || text === 'null' ? 'constant' : 'plain',
      },
      { re: sticky(String.raw`[{}[\],:]`), kind: 'punctuation' },
    ],
  },
};
