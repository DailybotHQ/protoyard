import { type Grammar, type RuleContext, sticky } from '../tokenizer.ts';
import { HASH_COMMENT, WHITESPACE, words } from './shared.ts';

const KEYWORDS = words(
  'if',
  'then',
  'else',
  'elif',
  'fi',
  'for',
  'while',
  'until',
  'do',
  'done',
  'case',
  'esac',
  'in',
  'function',
  'select',
  'return',
  'break',
  'continue',
  'export',
  'local',
  'readonly',
  'declare',
  'unset',
  'shift',
  'source',
  'exit'
);

/** Tokens after which the next word is a command name. */
const COMMAND_STARTERS = words(
  '|',
  '||',
  '&&',
  ';',
  '(',
  '{',
  '`',
  '$(',
  'then',
  'do',
  'else',
  'elif',
  '!'
);

/** True when only spaces or tabs separate `start` from a line start (bounded). */
function atLineStart(input: string, start: number): boolean {
  for (let i = start - 1, n = 0; i >= 0 && n < 64; i -= 1, n += 1) {
    const char = input[i];
    if (char === '\n') return true;
    if (char !== ' ' && char !== '\t') return false;
  }
  return start <= 64 && input.slice(0, start).trim() === '';
}

function word(text: string, ctx: RuleContext) {
  if (KEYWORDS.has(text)) return 'keyword' as const;
  const start = ctx.end - text.length;
  if (ctx.prev === null || COMMAND_STARTERS.has(ctx.prev.text) || atLineStart(ctx.input, start)) {
    return 'function' as const;
  }
  return 'plain' as const;
}

/** Shell scripts: commands, flags, variables, quoting and comments. */
export const bashGrammar: Grammar = {
  name: 'bash',
  start: 'code',
  states: {
    code: [
      WHITESPACE,
      HASH_COMMENT,
      // Single quotes have no escapes; both quotes may span lines.
      { re: sticky(String.raw`'[^']*(?:'|(?![\s\S]))`), kind: 'string' },
      // `\\[\s\S]?` lets a lone trailing backslash match too: an unterminated
      // string always runs to the end instead of failing and being rescanned.
      { re: sticky(String.raw`"(?:[^"\\]|\\[\s\S]?)*(?:"|(?![\s\S]))`), kind: 'string' },
      { re: sticky(String.raw`\$\{[^}\n]*\}?|\$(?:[A-Za-z_]\w*|[0-9@#?$!*-])`), kind: 'variable' },
      { re: sticky(String.raw`\$\(`), kind: 'punctuation' },
      { re: sticky(String.raw`(?<=^|[ \t])--?[A-Za-z][\w-]*`), kind: 'attr' },
      { re: sticky(String.raw`[A-Za-z_./~][\w./~:@%+-]*`), kind: word },
      { re: sticky(String.raw`\d+`), kind: 'number' },
      { re: sticky(String.raw`\|\||&&|[|&;<>!=]+`), kind: 'operator' },
      { re: sticky(String.raw`[(){}[\]\x60\\]`), kind: 'punctuation' },
    ],
  },
};
