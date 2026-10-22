import { type Grammar, sticky } from '../tokenizer.ts';
import { WHITESPACE, words } from './shared.ts';

const CONSTANTS = words(
  'true',
  'false',
  'yes',
  'no',
  'on',
  'off',
  'null',
  'True',
  'False',
  'Null',
  'TRUE',
  'FALSE',
  'NULL',
  '~'
);

/**
 * YAML: keys, scalars, anchors, tags, comments and document markers. A key is
 * only looked for after a line's indentation (and an optional `- `), so each
 * line is scanned for a key once.
 */
export const yamlGrammar: Grammar = {
  name: 'yaml',
  start: 'code',
  states: {
    code: [
      WHITESPACE,
      { re: sticky(String.raw`(?<=^|[ \t])#[^\n]*`), kind: 'comment' },
      { re: sticky(String.raw`^(?:---|\.\.\.)(?=[ \t]|$)`), kind: 'punctuation' },
      {
        re: sticky(
          String.raw`(?<=^[ \t]*(?:-[ \t]+)?)(?:"[^"\n]*"|'[^'\n]*'|[^\s#'"\-?:,[\]{}][^\n#]*?)(?=:(?:[ \t]|$))`
        ),
        kind: 'property',
      },
      { re: sticky(String.raw`"(?:[^"\\\n]|\\.?)*(?:"|$)`), kind: 'string' },
      { re: sticky(String.raw`'(?:[^'\n]|'')*(?:'|$)`), kind: 'string' },
      { re: sticky(String.raw`[&*][\w-]+`), kind: 'variable' },
      { re: sticky(String.raw`![\w!/.-]*`), kind: 'type' },
      {
        re: sticky(
          String.raw`[-+]?(?:\d[\d_]*(?:\.\d*)?(?:[eE][+-]?\d+)?|\.(?:inf|nan|Inf|NaN))(?![\w.-])`
        ),
        kind: 'number',
      },
      {
        re: sticky(String.raw`[A-Za-z_~][\w.~-]*`),
        kind: (text) => (CONSTANTS.has(text) ? 'constant' : 'plain'),
      },
      { re: sticky(String.raw`[:{}[\],?|>-]`), kind: 'punctuation' },
    ],
  },
};
