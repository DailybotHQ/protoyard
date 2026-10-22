/**
 * A tiny, linear-time code tokenizer. A grammar is a small state machine of
 * sticky regular expressions; at each position the first rule that matches
 * wins, and text no rule claims becomes `plain`. Tokens are data
 * (`{ kind, text }`) that renderers map to theme-token classes: nothing is
 * ever turned into HTML.
 *
 * Linear time comes from how the grammars are written, and the tests hold
 * them to it with pathological inputs:
 *
 * - every rule starts with a distinctive character and consumes at least one;
 * - an opening delimiter always matches: an unterminated string runs to the
 *   end of its line, and an unterminated block comment or multi-line string
 *   runs to the end of the input, so no position is scanned twice;
 * - no rule nests quantifiers over overlapping alternatives;
 * - keywords are looked up in sets after matching a word, never by a long
 *   alternation.
 */

export const CODE_TOKEN_KINDS = [
  'plain',
  'keyword',
  'string',
  'number',
  'comment',
  'operator',
  'punctuation',
  'function',
  'type',
  'property',
  'constant',
  'variable',
  'tag',
  'attr',
] as const;

export type CodeTokenKind = (typeof CODE_TOKEN_KINDS)[number];

export interface CodeToken {
  kind: CodeTokenKind;
  text: string;
}

/** Characters tokenized per call; the rest is returned as one plain token. */
export const CODE_TOKENIZE_MAX_LENGTH = 20_000;

/** What a classifier knows about the match. */
export interface RuleContext {
  input: string;
  /** Index just after the match. */
  end: number;
  /** The previous token that is not whitespace, if any. */
  prev: CodeToken | null;
}

export interface GrammarRule {
  /** Built with `sticky`; must not match the empty string or capture groups. */
  re: RegExp;
  kind: CodeTokenKind | ((text: string, ctx: RuleContext) => CodeTokenKind);
  /** State to switch to after this rule matches. */
  next?: string;
}

export interface Grammar {
  /** Language id, for diagnostics and tests. */
  name: string;
  start: string;
  states: Readonly<Record<string, readonly GrammarRule[]>>;
}

/**
 * Rule regex from a source string; every grammar builds rules with it. All
 * rules share the `m` flag (`^`/`$` are line anchors; write end of input as
 * `(?![\s\S])`) so a state's rules compile into one alternation.
 */
export function sticky(source: string): RegExp {
  return new RegExp(source, 'my');
}

const LOOKAHEAD = 64;

/** The next character after `index` that is not a space or tab (bounded lookahead). */
export function nextNonBlank(input: string, index: number): string {
  const limit = Math.min(input.length, index + LOOKAHEAD);
  for (let i = index; i < limit; i += 1) {
    const char = input[i] as string;
    if (char !== ' ' && char !== '\t') return char;
  }
  return '';
}

export interface WordSets {
  keywords?: ReadonlySet<string>;
  builtins?: ReadonlySet<string>;
  constants?: ReadonlySet<string>;
  types?: ReadonlySet<string>;
  /** Words after which the next word names a type (`class`, `interface`…). */
  typeIntroducers?: ReadonlySet<string>;
  /** Words after which the next word names a function (`function`, `def`). */
  functionIntroducers?: ReadonlySet<string>;
  /** Case-insensitive lookup (SQL). */
  ignoreCase?: boolean;
}

/** A classifier for identifiers: set lookups plus a little context. */
export function classifyWord(sets: WordSets) {
  return (text: string, ctx: RuleContext): CodeTokenKind => {
    const word = sets.ignoreCase ? text.toLowerCase() : text;
    const prev = ctx.prev?.text;
    if (prev === '.' || prev === '?.') return 'property';
    if (prev !== undefined && sets.functionIntroducers?.has(prev)) return 'function';
    if (prev !== undefined && sets.typeIntroducers?.has(prev)) return 'type';
    if (sets.keywords?.has(word)) return 'keyword';
    if (sets.constants?.has(word)) return 'constant';
    if (sets.types?.has(word)) return 'type';
    if (nextNonBlank(ctx.input, ctx.end) === '(') return 'function';
    if (sets.builtins?.has(word)) return 'function';
    return 'plain';
  };
}

function push(tokens: CodeToken[], kind: CodeTokenKind, text: string): void {
  if (text === '') return;
  const last = tokens[tokens.length - 1];
  if (last && last.kind === kind) last.text += text;
  else tokens.push({ kind, text });
}

/** A state's rules as one sticky alternation, in rule order (first match wins). */
interface CompiledState {
  re: RegExp;
  rules: readonly GrammarRule[];
}

const compiled = new WeakMap<Grammar, Map<string, CompiledState>>();

function captureGroups(source: string): number {
  return (new RegExp(`${source}|`).exec('') as RegExpExecArray).length - 1;
}

/**
 * Compiles a state once per grammar. One `exec` per position replaces one per
 * rule, and alternation order keeps the first-rule-wins semantics.
 */
function compileState(grammar: Grammar, state: string): CompiledState {
  let states = compiled.get(grammar);
  if (!states) {
    states = new Map();
    compiled.set(grammar, states);
  }
  const cached = states.get(state);
  if (cached) return cached;
  const rules = grammar.states[state] ?? [];
  for (const rule of rules) {
    if (captureGroups(rule.re.source) > 0) {
      throw new Error(
        `${grammar.name}.${state}: use (?:…) instead of capture groups in ${rule.re.source}`
      );
    }
  }
  const source = rules.length > 0 ? rules.map((rule) => `(${rule.re.source})`).join('|') : '(?!)';
  const entry = { re: new RegExp(source, 'my'), rules };
  states.set(state, entry);
  return entry;
}

const BLANK = /^[ \t\r\n]+$/;

/**
 * Tokenizes `code` with `grammar`. The concatenated token texts always equal
 * the input. Input beyond `CODE_TOKENIZE_MAX_LENGTH` is one plain token.
 */
export function tokenize(code: string, grammar: Grammar): CodeToken[] {
  const tokens: CodeToken[] = [];
  const input =
    code.length > CODE_TOKENIZE_MAX_LENGTH ? code.slice(0, CODE_TOKENIZE_MAX_LENGTH) : code;
  let current = compileState(grammar, grammar.start);
  let prev: CodeToken | null = null;
  let index = 0;
  while (index < input.length) {
    current.re.lastIndex = index;
    const match = current.re.exec(input);
    const text = match?.[0] ?? '';
    if (match === null || text.length === 0) {
      // No rule claims this character: it is plain text.
      const char = input[index] as string;
      push(tokens, 'plain', char);
      if (!BLANK.test(char)) prev = { kind: 'plain', text: char };
      index += 1;
      continue;
    }
    let which = 1;
    while (match[which] === undefined) which += 1;
    const rule = current.rules[which - 1] as GrammarRule;
    const end = index + text.length;
    const kind: CodeTokenKind =
      typeof rule.kind === 'function' ? rule.kind(text, { input, end, prev }) : rule.kind;
    push(tokens, kind, text);
    if (!BLANK.test(text)) prev = { kind, text };
    if (rule.next) current = compileState(grammar, rule.next);
    index = end;
  }
  if (input.length < code.length) push(tokens, 'plain', code.slice(input.length));
  return tokens;
}

/** Splits tokens into lines; line breaks are dropped, empty lines are `[]`. */
export function splitTokenLines(tokens: readonly CodeToken[]): CodeToken[][] {
  const lines: CodeToken[][] = [[]];
  for (const token of tokens) {
    const parts = token.text.split('\n');
    parts.forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part !== '')
        (lines[lines.length - 1] as CodeToken[]).push({ kind: token.kind, text: part });
    });
  }
  return lines;
}
