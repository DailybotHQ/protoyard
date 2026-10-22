/**
 * `@protoyard/blocks/code` — a tiny, pure-TypeScript code tokenizer for code
 * blocks (ADR-037; it replaces a 303 KB highlight.js). It turns source into
 * `{ kind, text }` tokens in linear time for ts, js, json, bash, python,
 * html, css, sql and yaml, and resolves stepped line highlights. Output is
 * data only: renderers map kinds to theme-token classes and print the text,
 * never HTML.
 *
 * ```ts
 * const lines = splitTokenLines(tokenizeCode('const a = 1;', 'ts'));
 * // [[{ kind: 'keyword', text: 'const' }, { kind: 'plain', text: ' a ' }, …]]
 * ```
 *
 * `tokenizeCode` includes every grammar. A renderer that knows its language
 * can import one grammar and call `tokenize` instead.
 */
import { bashGrammar } from './languages/bash.ts';
import { cssGrammar } from './languages/css.ts';
import { htmlGrammar } from './languages/html.ts';
import { javascriptGrammar, typescriptGrammar } from './languages/javascript.ts';
import { jsonGrammar } from './languages/json.ts';
import { pythonGrammar } from './languages/python.ts';
import { sqlGrammar } from './languages/sql.ts';
import { yamlGrammar } from './languages/yaml.ts';
import { type CodeToken, type Grammar, tokenize } from './tokenizer.ts';

export {
  countCodeLines,
  type HighlightStep,
  parseLineSpec,
  resolveHighlightSteps,
} from './highlight.ts';
export {
  CODE_TOKEN_KINDS,
  CODE_TOKENIZE_MAX_LENGTH,
  type CodeToken,
  type CodeTokenKind,
  type Grammar,
  type GrammarRule,
  type RuleContext,
  splitTokenLines,
  sticky,
  tokenize,
} from './tokenizer.ts';
export {
  bashGrammar,
  cssGrammar,
  htmlGrammar,
  javascriptGrammar,
  jsonGrammar,
  pythonGrammar,
  sqlGrammar,
  typescriptGrammar,
  yamlGrammar,
};

/** Languages with a grammar. Anything else is plain text. */
export const CODE_GRAMMAR_LANGUAGES = [
  'ts',
  'js',
  'json',
  'bash',
  'python',
  'html',
  'css',
  'sql',
  'yaml',
] as const;

export type CodeGrammarLanguage = (typeof CODE_GRAMMAR_LANGUAGES)[number];

const GRAMMARS: Readonly<Record<CodeGrammarLanguage, Grammar>> = {
  ts: typescriptGrammar,
  js: javascriptGrammar,
  json: jsonGrammar,
  bash: bashGrammar,
  python: pythonGrammar,
  html: htmlGrammar,
  css: cssGrammar,
  sql: sqlGrammar,
  yaml: yamlGrammar,
};

const ALIASES: Readonly<Record<string, CodeGrammarLanguage>> = {
  typescript: 'ts',
  tsx: 'ts',
  mts: 'ts',
  cts: 'ts',
  javascript: 'js',
  jsx: 'js',
  mjs: 'js',
  cjs: 'js',
  jsonc: 'json',
  json5: 'json',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  console: 'bash',
  py: 'python',
  python3: 'python',
  htm: 'html',
  xml: 'html',
  svg: 'html',
  svelte: 'html',
  vue: 'html',
  postgres: 'sql',
  postgresql: 'sql',
  sqlite: 'sql',
  mysql: 'sql',
  yml: 'yaml',
};

/** A language id or alias (`typescript`, `sh`, `yml`…) → a grammar language, or `null`. */
export function resolveCodeLanguage(lang: string): CodeGrammarLanguage | null {
  const key = lang.trim().toLowerCase();
  if (Object.hasOwn(GRAMMARS, key)) return key as CodeGrammarLanguage;
  return Object.hasOwn(ALIASES, key) ? (ALIASES[key] as CodeGrammarLanguage) : null;
}

/**
 * Tokenizes `code` for `lang` (an id or alias). Unknown languages, including
 * `text`, give one plain token. Concatenated texts always equal the input.
 */
export function tokenizeCode(code: string, lang: string): CodeToken[] {
  const resolved = resolveCodeLanguage(lang);
  if (resolved === null) return code === '' ? [] : [{ kind: 'plain', text: code }];
  return tokenize(code, GRAMMARS[resolved]);
}
