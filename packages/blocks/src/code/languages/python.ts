import { classifyWord, type Grammar, sticky } from '../tokenizer.ts';
import { C_NUMBER, HASH_COMMENT, WHITESPACE, words } from './shared.ts';

const word = classifyWord({
  keywords: words(
    'and',
    'as',
    'assert',
    'async',
    'await',
    'break',
    'case',
    'class',
    'continue',
    'def',
    'del',
    'elif',
    'else',
    'except',
    'finally',
    'for',
    'from',
    'global',
    'if',
    'import',
    'in',
    'is',
    'lambda',
    'match',
    'nonlocal',
    'not',
    'or',
    'pass',
    'raise',
    'return',
    'try',
    'while',
    'with',
    'yield'
  ),
  constants: words('True', 'False', 'None', 'Ellipsis', 'NotImplemented'),
  builtins: words(
    'abs',
    'all',
    'any',
    'bool',
    'dict',
    'enumerate',
    'filter',
    'float',
    'int',
    'isinstance',
    'len',
    'list',
    'map',
    'max',
    'min',
    'open',
    'print',
    'range',
    'round',
    'set',
    'sorted',
    'str',
    'sum',
    'super',
    'tuple',
    'type',
    'zip'
  ),
  typeIntroducers: words('class'),
  functionIntroducers: words('def'),
});

const PREFIX = '(?:[rRbBuUfF]{1,2})?';

/** Python 3: triple-quoted and prefixed strings, decorators, keywords and builtins. */
export const pythonGrammar: Grammar = {
  name: 'python',
  start: 'code',
  states: {
    code: [
      WHITESPACE,
      HASH_COMMENT,
      // Triple quotes may span lines; unterminated ones run to the end.
      {
        re: sticky(
          `${PREFIX}${String.raw`(?:"""[\s\S]*?(?:"""|(?![\s\S]))|'''[\s\S]*?(?:'''|(?![\s\S])))`}`
        ),
        kind: 'string',
      },
      {
        re: sticky(
          `${PREFIX}${String.raw`(?:"(?:[^"\\\n]|\\.?)*(?:"|$)|'(?:[^'\\\n]|\\.?)*(?:'|$))`}`
        ),
        kind: 'string',
      },
      { re: sticky(String.raw`(?<=^[ \t]*)@[A-Za-z_][\w.]*`), kind: 'attr' },
      { re: sticky(String.raw`[A-Za-z_]\w*`), kind: word },
      C_NUMBER,
      { re: sticky(String.raw`[+\-*/%=!<>&|^~:@]+`), kind: 'operator' },
      { re: sticky(String.raw`[()[\]{},.;]`), kind: 'punctuation' },
    ],
  },
};
