// @vitest-environment node
// biome-ignore-all lint/suspicious/noTemplateCurlyInString: fixtures are source code text that contains ${…}.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import {
  bashGrammar,
  CODE_GRAMMAR_LANGUAGES,
  CODE_TOKEN_KINDS,
  CODE_TOKENIZE_MAX_LENGTH,
  type CodeToken,
  cssGrammar,
  type Grammar,
  htmlGrammar,
  javascriptGrammar,
  jsonGrammar,
  parseLineSpec,
  pythonGrammar,
  resolveCodeLanguage,
  resolveHighlightSteps,
  splitTokenLines,
  sqlGrammar,
  sticky,
  tokenize,
  tokenizeCode,
  typescriptGrammar,
  yamlGrammar,
} from '../src/code/index.ts';
import { CODE_LANGUAGES } from '../src/index.ts';

/** `kind:text` for styled tokens, bare text for plain ones. */
const compact = (tokens: readonly CodeToken[]) =>
  tokens.map((t) => (t.kind === 'plain' ? t.text : `${t.kind}:${t.text}`));
const joined = (tokens: readonly CodeToken[]) => tokens.map((t) => t.text).join('');

const GOLDEN: Record<string, { code: string; tokens: string[] }> = {
  ts: {
    code: 'const greet = (name: string): Promise<User> => api.get(`/u/${name}`); // hi\nclass Foo extends Bar {}',
    tokens: [
      'keyword:const',
      ' greet ',
      'operator:=',
      ' ',
      'punctuation:(',
      'name',
      'operator::',
      ' ',
      'type:string',
      'punctuation:)',
      'operator::',
      ' ',
      'type:Promise',
      'operator:<',
      'type:User',
      'operator:>',
      ' ',
      'operator:=>',
      ' api',
      'punctuation:.',
      'property:get',
      'punctuation:(',
      'string:`/u/${name}`',
      'punctuation:);',
      ' ',
      'comment:// hi',
      '\n',
      'keyword:class',
      ' ',
      'type:Foo',
      ' ',
      'keyword:extends',
      ' ',
      'type:Bar',
      ' ',
      'punctuation:{}',
    ],
  },
  js: {
    code: "import { a } from './a.js';\nexport async function load(id) {\n  /* c */ return a?.items.map((x) => x * 0x1F) ?? null;\n}",
    tokens: [
      'keyword:import',
      ' ',
      'punctuation:{',
      ' a ',
      'punctuation:}',
      ' ',
      'keyword:from',
      ' ',
      "string:'./a.js'",
      'punctuation:;',
      '\n',
      'keyword:export',
      ' ',
      'keyword:async',
      ' ',
      'keyword:function',
      ' ',
      'function:load',
      'punctuation:(',
      'id',
      'punctuation:)',
      ' ',
      'punctuation:{',
      '\n  ',
      'comment:/* c */',
      ' ',
      'keyword:return',
      ' a',
      'operator:?.',
      'property:items',
      'punctuation:.',
      'property:map',
      'punctuation:((',
      'x',
      'punctuation:)',
      ' ',
      'operator:=>',
      ' x ',
      'operator:*',
      ' ',
      'number:0x1F',
      'punctuation:)',
      ' ',
      'operator:??',
      ' ',
      'constant:null',
      'punctuation:;',
      '\n',
      'punctuation:}',
    ],
  },
  json: {
    code: '{"name": "x", "n": -1.5e3, "ok": true, "v": null}',
    tokens: [
      'punctuation:{',
      'property:"name"',
      'punctuation::',
      ' ',
      'string:"x"',
      'punctuation:,',
      ' ',
      'property:"n"',
      'punctuation::',
      ' ',
      'number:-1.5e3',
      'punctuation:,',
      ' ',
      'property:"ok"',
      'punctuation::',
      ' ',
      'constant:true',
      'punctuation:,',
      ' ',
      'property:"v"',
      'punctuation::',
      ' ',
      'constant:null',
      'punctuation:}',
    ],
  },
  bash: {
    code: '#!/bin/bash\nexport FOO="bar $HOME"\npnpm install --frozen-lockfile && echo ${FOO} # done',
    tokens: [
      'comment:#!/bin/bash',
      '\n',
      'keyword:export',
      ' FOO',
      'operator:=',
      'string:"bar $HOME"',
      '\n',
      'function:pnpm',
      ' install ',
      'attr:--frozen-lockfile',
      ' ',
      'operator:&&',
      ' ',
      'function:echo',
      ' ',
      'variable:${FOO}',
      ' ',
      'comment:# done',
    ],
  },
  python: {
    code: '@dataclass\nclass A:\n    def f(self, x=None):\n        return f"{x}" + """doc"""  # c',
    tokens: [
      'attr:@dataclass',
      '\n',
      'keyword:class',
      ' ',
      'type:A',
      'operator::',
      '\n    ',
      'keyword:def',
      ' ',
      'function:f',
      'punctuation:(',
      'self',
      'punctuation:,',
      ' x',
      'operator:=',
      'constant:None',
      'punctuation:)',
      'operator::',
      '\n        ',
      'keyword:return',
      ' ',
      'string:f"{x}"',
      ' ',
      'operator:+',
      ' ',
      'string:"""doc"""',
      '  ',
      'comment:# c',
    ],
  },
  css: {
    code: '@media (max-width: 600px) {\n  .card:hover > a { color: #fff; margin: 0 1.5rem !important; }\n}',
    tokens: [
      'keyword:@media',
      ' ',
      'punctuation:(',
      'property:max-width',
      'punctuation::',
      ' ',
      'number:600px',
      'punctuation:)',
      ' ',
      'punctuation:{',
      '\n  ',
      'attr:.card',
      'keyword::hover',
      ' ',
      'punctuation:>',
      ' ',
      'tag:a',
      ' ',
      'punctuation:{',
      ' ',
      'property:color',
      'punctuation::',
      ' ',
      'number:#fff',
      'punctuation:;',
      ' ',
      'property:margin',
      'punctuation::',
      ' ',
      'number:0',
      ' ',
      'number:1.5rem',
      ' ',
      'keyword:!important',
      'punctuation:;',
      ' ',
      'punctuation:}',
      '\n',
      'punctuation:}',
    ],
  },
  html: {
    code: '<!doctype html>\n<a href="x" data-x=1 disabled>T &amp; C</a><!-- c -->',
    tokens: [
      'keyword:<!doctype html>',
      '\n',
      'punctuation:<',
      'tag:a',
      ' ',
      'attr:href',
      'operator:=',
      'string:"x"',
      ' ',
      'attr:data-x',
      'operator:=',
      'string:1',
      ' ',
      'attr:disabled',
      'punctuation:>',
      'T ',
      'constant:&amp;',
      ' C',
      'punctuation:</',
      'tag:a',
      'punctuation:>',
      'comment:<!-- c -->',
    ],
  },
  sql: {
    code: "SELECT u.id, count(*) FROM users u WHERE name = 'O''Brien' AND id > $1 -- c",
    tokens: [
      'keyword:SELECT',
      ' u',
      'punctuation:.',
      'property:id',
      'punctuation:,',
      ' ',
      'function:count',
      'punctuation:(',
      'operator:*',
      'punctuation:)',
      ' ',
      'keyword:FROM',
      ' users u ',
      'keyword:WHERE',
      ' name ',
      'operator:=',
      ' ',
      "string:'O''Brien'",
      ' ',
      'keyword:AND',
      ' id ',
      'operator:>',
      ' ',
      'variable:$1',
      ' ',
      'comment:-- c',
    ],
  },
  yaml: {
    code: '# c\n---\nname: demo\nlist:\n  - key: "v" # c\n    on: true\nnum: 3.5\nref: *anchor',
    tokens: [
      'comment:# c',
      '\n',
      'punctuation:---',
      '\n',
      'property:name',
      'punctuation::',
      ' demo\n',
      'property:list',
      'punctuation::',
      '\n  ',
      'punctuation:-',
      ' ',
      'property:key',
      'punctuation::',
      ' ',
      'string:"v"',
      ' ',
      'comment:# c',
      '\n    ',
      'property:on',
      'punctuation::',
      ' ',
      'constant:true',
      '\n',
      'property:num',
      'punctuation::',
      ' ',
      'number:3.5',
      '\n',
      'property:ref',
      'punctuation::',
      ' ',
      'variable:*anchor',
    ],
  },
};

const GRAMMARS: Grammar[] = [
  typescriptGrammar,
  javascriptGrammar,
  jsonGrammar,
  bashGrammar,
  pythonGrammar,
  cssGrammar,
  htmlGrammar,
  sqlGrammar,
  yamlGrammar,
];

describe('code tokenizer: golden tokens', () => {
  it('has a golden fixture for every grammar language', () => {
    expect(Object.keys(GOLDEN).sort()).toEqual([...CODE_GRAMMAR_LANGUAGES].sort());
  });

  it.each(Object.entries(GOLDEN))('tokenizes %s', (lang, { code, tokens }) => {
    const result = tokenizeCode(code, lang);
    expect(compact(result)).toEqual(tokens);
    expect(joined(result)).toBe(code);
  });

  it('handles strings and comments that never close', () => {
    expect(compact(tokenizeCode('a = "open\nb = 1', 'js'))).toEqual([
      'a ',
      'operator:=',
      ' ',
      'string:"open',
      '\nb ',
      'operator:=',
      ' ',
      'number:1',
    ]);
    expect(compact(tokenizeCode('x /* open\nstill', 'css'))).toEqual([
      'tag:x',
      ' ',
      'comment:/* open\nstill',
    ]);
    expect(compact(tokenizeCode('s = """open\nmore', 'python'))).toEqual([
      's ',
      'operator:=',
      ' ',
      'string:"""open\nmore',
    ]);
    expect(compact(tokenizeCode('<!-- open', 'html'))).toEqual(['comment:<!-- open']);
  });

  it('keeps comment markers inside strings and words', () => {
    expect(compact(tokenizeCode('echo "a # b" a#b $#', 'bash'))).toEqual([
      'function:echo',
      ' ',
      'string:"a # b"',
      ' a#b ',
      'variable:$#',
    ]);
    expect(compact(tokenizeCode('url = "http://x" // c', 'js'))).toEqual([
      'url ',
      'operator:=',
      ' ',
      'string:"http://x"',
      ' ',
      'comment:// c',
    ]);
  });

  it('treats unknown languages and text as one plain token', () => {
    expect(tokenizeCode('<b>x</b>', 'text')).toEqual([{ kind: 'plain', text: '<b>x</b>' }]);
    expect(tokenizeCode('fn main() {}', 'rust')).toEqual([{ kind: 'plain', text: 'fn main() {}' }]);
    expect(tokenizeCode('', 'ts')).toEqual([]);
    expect(tokenizeCode('', 'text')).toEqual([]);
  });

  it('resolves language aliases, case-insensitively', () => {
    expect(resolveCodeLanguage('TypeScript')).toBe('ts');
    expect(resolveCodeLanguage('tsx')).toBe('ts');
    expect(resolveCodeLanguage('sh')).toBe('bash');
    expect(resolveCodeLanguage('yml')).toBe('yaml');
    expect(resolveCodeLanguage('postgres')).toBe('sql');
    expect(resolveCodeLanguage('text')).toBeNull();
    expect(resolveCodeLanguage('constructor')).toBeNull();
    expect(resolveCodeLanguage('__proto__')).toBeNull();
  });

  it('highlights every code block language except text', () => {
    for (const lang of CODE_LANGUAGES) {
      if (lang === 'text') expect(resolveCodeLanguage(lang)).toBeNull();
      else expect(resolveCodeLanguage(lang), lang).toBe(lang);
    }
  });
});

describe('code tokenizer: invariants', () => {
  const corpus = [
    ...Object.values(GOLDEN).map((g) => g.code),
    'a\r\nb\r\n',
    '\t\tindented\n\n\n',
    'emoji 🚀 and ünïcödé and \u2028 separators',
    '\\"\'`${}/*-->--#',
  ];

  it('always concatenates back to the input and uses only known kinds', () => {
    for (const grammar of GRAMMARS) {
      for (const code of corpus) {
        const tokens = tokenize(code, grammar);
        expect(joined(tokens), `${grammar.name}: ${code.slice(0, 30)}`).toBe(code);
        for (const token of tokens) {
          expect(CODE_TOKEN_KINDS).toContain(token.kind);
          expect(token.text.length).toBeGreaterThan(0);
        }
        for (let i = 1; i < tokens.length; i += 1) {
          expect(tokens[i]?.kind, 'adjacent tokens of one kind are merged').not.toBe(
            tokens[i - 1]?.kind
          );
        }
      }
    }
  });

  it('round-trips seeded random text in every grammar', () => {
    let seed = 0x5eed;
    const alphabet = 'ab_ $#@:;{}()[]<>="\'`\\/*-+.,!?&|^~%\n\t 0123456789xX';
    const next = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    for (let i = 0; i < 200; i += 1) {
      const length = Math.floor(next() * 200);
      let code = '';
      for (let j = 0; j < length; j += 1) code += alphabet[Math.floor(next() * alphabet.length)];
      for (const grammar of GRAMMARS) expect(joined(tokenize(code, grammar))).toBe(code);
    }
  });

  it('tokenizes only the first 20,000 characters and keeps the rest as plain text', () => {
    const code = `${'const a = 1;\n'.repeat(1_600)}const tail = 2;`;
    expect(code.length).toBeGreaterThan(CODE_TOKENIZE_MAX_LENGTH);
    const tokens = tokenizeCode(code, 'ts');
    expect(joined(tokens)).toBe(code);
    const last = tokens[tokens.length - 1];
    expect(last?.kind).toBe('plain');
    expect(last?.text.endsWith('const tail = 2;')).toBe(true);
  });

  it('uses only sticky, multiline rules with valid state transitions', () => {
    for (const grammar of GRAMMARS) {
      expect(Object.keys(grammar.states)).toContain(grammar.start);
      for (const [state, rules] of Object.entries(grammar.states)) {
        for (const rule of rules) {
          expect(rule.re.flags, `${grammar.name}.${state} ${rule.re.source}`).toBe('my');
          if (rule.next) expect(Object.keys(grammar.states)).toContain(rule.next);
        }
      }
    }
  });

  it('refuses a grammar rule with a capture group instead of misattributing matches', () => {
    const broken: Grammar = {
      name: 'broken',
      start: 'a',
      states: { a: [{ re: sticky('(x)y'), kind: 'keyword' }] },
    };
    expect(() => tokenize('xy', broken)).toThrow(/capture groups/);
    const ordered: Grammar = {
      name: 'ordered',
      start: 'a',
      states: {
        a: [
          { re: sticky('ab'), kind: 'keyword' },
          { re: sticky('a'), kind: 'string' },
        ],
      },
    };
    expect(compact(tokenize('aba', ordered))).toEqual(['keyword:ab', 'string:a']);
  });

  it('splits tokens into lines without the line breaks', () => {
    const lines = splitTokenLines(tokenizeCode('/* a\nb */ x\n\ny', 'js'));
    expect(lines.map(compact)).toEqual([['comment:/* a'], ['comment:b */', ' x'], [], ['y']]);
    expect(splitTokenLines([])).toEqual([[]]);
  });
});

describe('code tokenizer: pathological inputs stay linear', () => {
  const patterns = [
    '"',
    "'",
    '`',
    '\\',
    '"\\',
    "'\\",
    '/*',
    '*/',
    '//',
    '<!--',
    '<',
    '</',
    '<a ',
    '="',
    "='",
    '&',
    '&#',
    '#',
    '$',
    '${',
    '$(',
    '@',
    'a',
    'a ',
    '1',
    '1.',
    '1e',
    '0x',
    '-',
    '- ',
    '--',
    ':',
    'a:',
    'k: ',
    '.a:b ',
    'a{',
    '{',
    '}',
    ';',
    '"""',
    "'''",
    "''",
    '""',
    'r"',
    "f'",
    '!',
    '!important',
    '?.',
    '=>',
    '\t',
    ' ',
    '\n',
    ' \n',
    '#fff',
    '*a',
    '&a',
    '---\n',
    'a\\\n',
    // Escapes next to delimiters: a lone trailing backslash must not make a string fail.
    '`\\',
    '"\\"',
    "'\\'",
    '"""\\',
    "'''\\",
    '\\\n',
    '"a\\',
    '`${',
    '$"',
    '<a b="',
  ];
  const SIZE = CODE_TOKENIZE_MAX_LENGTH;
  const BUDGET_MS = 50;
  // The millisecond budget depends on machine load, so it is asserted only in the
  // serialized perf run (`pnpm test:perf`); every run still checks the output.
  const PERF = process.env.PROTOYARD_PERF === '1';

  it.each(GRAMMARS.map((g) => [g.name, g] as const))(
    'tokenizes 20 KB pathological %s inputs (under 50 ms each in the perf run)',
    (_name, grammar) => {
      tokenize('warm up '.repeat(100), grammar);
      const slow: string[] = [];
      for (const pattern of patterns) {
        const code = pattern.repeat(Math.ceil(SIZE / pattern.length)).slice(0, SIZE);
        expect(joined(tokenize(code, grammar))).toBe(code);
        // The median of three runs measures the algorithm, not a busy machine's
        // scheduler: a quadratic pattern takes hundreds of ms on every run.
        const runs: number[] = [];
        for (let i = 0; i < 3; i += 1) {
          const started = performance.now();
          tokenize(code, grammar);
          runs.push(performance.now() - started);
        }
        const median = runs.sort((a, b) => a - b)[1] as number;
        if (median >= BUDGET_MS) slow.push(`${JSON.stringify(pattern)}: ${median.toFixed(1)} ms`);
      }
      if (PERF) expect(slow).toEqual([]);
    }
  );
});

describe('highlight steps', () => {
  it('resolves line specs and range lists to sorted, unique, clamped lines', () => {
    expect(resolveHighlightSteps(['1-2,4', [[1, 2], 4], '3', [[2, 9]]], 5)).toEqual([
      [1, 2, 4],
      [1, 2, 4],
      [3],
      [2, 3, 4, 5],
    ]);
    expect(resolveHighlightSteps(['2,1,2-3'], 10)).toEqual([[1, 2, 3]]);
  });

  it('highlights nothing for malformed steps', () => {
    expect(
      resolveHighlightSteps(['3-1', '0', 'x', [[2, 1]], [0], [1.5], [[1, 2, 3] as never]], 10)
    ).toEqual([[], [], [], [], [], [], []]);
    expect(resolveHighlightSteps(['1-3'], 0)).toEqual([[]]);
  });

  it('shares the code block schema parser', () => {
    expect(parseLineSpec('1-2,4')).toEqual([
      [1, 2],
      [4, 4],
    ]);
    expect(parseLineSpec('2-1')).toBeNull();
  });
});

describe('code tokenizer: package hygiene', () => {
  it('imports nothing outside the code folder (no zod, no schemas)', () => {
    const dir = join(import.meta.dirname, '..', 'src', 'code');
    const files: string[] = [];
    const walk = (path: string) => {
      for (const name of readdirSync(path)) {
        const full = join(path, name);
        if (statSync(full).isDirectory()) walk(full);
        else files.push(full);
      }
    };
    walk(dir);
    expect(files.length).toBeGreaterThanOrEqual(12);
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) {
        expect(match[1], file).toMatch(/^\.\.?\//);
        expect(match[1], file).not.toMatch(/schema|\.\.\/\.\./);
      }
      expect(text).not.toMatch(/innerHTML|\{@html|\beval\s*\(|new\s+Function/);
    }
  });
});
