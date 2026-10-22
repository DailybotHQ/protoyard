import { classifyWord, type Grammar, type GrammarRule, sticky } from '../tokenizer.ts';
import {
  BLOCK_COMMENT,
  C_NUMBER,
  DOUBLE_QUOTED,
  SINGLE_QUOTED,
  SLASH_COMMENT,
  WHITESPACE,
  words,
} from './shared.ts';

const JS_KEYWORDS = [
  'as',
  'async',
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'export',
  'extends',
  'finally',
  'for',
  'from',
  'function',
  'if',
  'import',
  'in',
  'instanceof',
  'let',
  'new',
  'of',
  'return',
  'static',
  'super',
  'switch',
  'this',
  'throw',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
];

const TS_KEYWORDS = [
  'abstract',
  'asserts',
  'declare',
  'enum',
  'implements',
  'infer',
  'interface',
  'is',
  'keyof',
  'module',
  'namespace',
  'override',
  'private',
  'protected',
  'public',
  'readonly',
  'satisfies',
  'type',
  'unique',
];

const CONSTANTS = words('true', 'false', 'null', 'undefined', 'NaN', 'Infinity');
const TYPE_INTRODUCERS = words(
  'class',
  'interface',
  'type',
  'enum',
  'extends',
  'implements',
  'new'
);
const FUNCTION_INTRODUCERS = words('function');

/** `` `…` ``, possibly across lines; `${…}` stays part of the string. */
const TEMPLATE: GrammarRule = {
  re: sticky(String.raw`\x60(?:[^\x60\\]|\\[\s\S]?)*(?:\x60|(?![\s\S]))`),
  kind: 'string',
};

function grammar(name: string, keywords: ReadonlySet<string>, types: ReadonlySet<string>): Grammar {
  const word = classifyWord({
    keywords,
    constants: CONSTANTS,
    types,
    typeIntroducers: TYPE_INTRODUCERS,
    functionIntroducers: FUNCTION_INTRODUCERS,
  });
  const capitalizedTypes = name === 'ts';
  return {
    name,
    start: 'code',
    states: {
      code: [
        WHITESPACE,
        SLASH_COMMENT,
        BLOCK_COMMENT,
        DOUBLE_QUOTED,
        SINGLE_QUOTED,
        TEMPLATE,
        {
          re: sticky(String.raw`[A-Za-z_$][\w$]*`),
          kind: (text, ctx) => {
            const kind = word(text, ctx);
            // In TypeScript a capitalized name that is not called is usually a type.
            if (kind === 'plain' && capitalizedTypes && /^[A-Z]/.test(text)) return 'type';
            return kind;
          },
        },
        C_NUMBER,
        { re: sticky(String.raw`@[A-Za-z_$][\w$]*`), kind: 'attr' },
        { re: sticky(String.raw`\?\.|[+\-*/%=!<>&|^~?:]+`), kind: 'operator' },
        { re: sticky(String.raw`[{}()[\];,.]`), kind: 'punctuation' },
      ],
    },
  };
}

export const javascriptGrammar: Grammar = grammar('js', words(...JS_KEYWORDS), words());

export const typescriptGrammar: Grammar = grammar(
  'ts',
  words(...JS_KEYWORDS, ...TS_KEYWORDS),
  words('string', 'number', 'boolean', 'any', 'unknown', 'never', 'object', 'symbol', 'bigint')
);
