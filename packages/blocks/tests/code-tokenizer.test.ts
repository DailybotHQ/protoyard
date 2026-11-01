// @vitest-environment node
// biome-ignore-all lint/suspicious/noTemplateCurlyInString: fixtures are source code text that contains ${…}.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import {
  bashGrammar,
  CODE_TOKENIZE_MAX_LENGTH,
  type CodeToken,
  cssGrammar,
  type Grammar,
  htmlGrammar,
  javascriptGrammar,
  jsonGrammar,
  pythonGrammar,
  sqlGrammar,
  tokenize,
  typescriptGrammar,
  yamlGrammar,
} from '../src/code/index.ts';

const joined = (tokens: readonly CodeToken[]) => tokens.map((t) => t.text).join('');

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

describe.runIf(process.env.PROTOYARD_PERF === '1')(
  'code tokenizer: pathological inputs stay linear',
  () => {
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

    it('tokenizes 20 KB pathological inputs in every grammar in under 50 ms each', () => {
      for (const [_name, grammar] of GRAMMARS.map((g) => [g.name, g] as const)) {
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
        expect(slow).toEqual([]);
      }
    });
  }
);

describe('code tokenizer: package hygiene', () => {
  it('re-exports the Texuli tokenizer and never builds HTML', () => {
    const dir = join(import.meta.dirname, '..', 'src', 'code');
    const files = readdirSync(dir).filter((name) => name.endsWith('.ts'));
    expect(files).toEqual(['index.ts']);
    const text = readFileSync(join(dir, 'index.ts'), 'utf8');
    expect(text).toContain('@texuli/blocks/code/tokenizer');
    expect(text).toContain('@texuli/blocks/code');
    expect(text).not.toMatch(/innerHTML|\{@html|\beval\s*\(|new\s+Function/);
  });
});
