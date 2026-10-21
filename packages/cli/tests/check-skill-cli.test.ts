// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { afterAll, describe, expect, it } from 'vitest';
import {
  checkInvocation,
  checkReference,
  checkSkillCli,
  cliTree,
  extractInvocations,
  shellWords,
} from '../../../scripts/check-skill-cli.ts';
import { createProgram } from '../src/program.ts';

/** A small CLI with the same shapes as the real one: global options, nested commands, an argument. */
function fixtureTree() {
  const program = new Command('protoyard')
    .version('0.0.0', '-v, --version')
    .option('--json', 'json')
    .option('--root <dir>', 'root')
    .option('--no-color', 'no color');
  const quick = program.command('quick [brief]').option('--slug <slug>', 'slug');
  quick.command('serve <dir>').option('-p, --port <port>', 'port').option('--open', 'open');
  program.command('new <slug>').option('-t, --template <name>', 'template');
  const theme = program.command('theme');
  theme.command('list').option('--search <query>', 'search');
  return cliTree(program);
}

const tree = fixtureTree();
const issuesFor = (markdown: string) =>
  extractInvocations(markdown, 'x.md').flatMap((invocation) => checkInvocation(tree, invocation));

describe('shellWords', () => {
  it('groups quotes, keeps placeholders and unescapes table pipes', () => {
    expect(shellWords('quick "a b" <slug\\|dir> --port=1')).toEqual([
      'quick',
      '\u0000a b',
      '<slug|dir>',
      '--port=1',
    ]);
  });
});

describe('extractInvocations', () => {
  it('reads shell fences, pnpm/npx forms, env prefixes, continuations and inline code', () => {
    const markdown = [
      '```bash',
      'protoyard quick "a brief" --slug s   # comment --ignored',
      'pnpm protoyard new demo \\',
      '  --template blank',
      'PROTOYARD_REVIEW=1 npx protoyard theme list && protoyard --json',
      '```',
      'Run `pnpm exec protoyard quick serve s --open` then `protoyard new --help`.',
    ].join('\n');
    const found = extractInvocations(markdown, 'x.md').map(({ line, args }) => ({ line, args }));
    expect(found).toEqual([
      { line: 2, args: ['quick', '\u0000a brief', '--slug', 's'] },
      { line: 3, args: ['new', 'demo', '--template', 'blank'] },
      { line: 5, args: ['theme', 'list'] },
      { line: 5, args: ['--json'] },
      { line: 7, args: ['quick', 'serve', 's', '--open'] },
      { line: 7, args: ['new', '--help'] },
    ]);
  });

  it('ignores other tools, non-shell fences and planned sections', () => {
    const markdown = [
      '`npx skills add x --skill protoyard -g` and `pnpm --filter @protoyard/player build`',
      '```ts',
      'protoyard nonsense --nope',
      '```',
      '## Workflow ideas not yet implemented',
      '`protoyard quick list` and',
      '```bash',
      'protoyard quick prune --older-than 14d',
      '```',
      '## Planned (not available)',
      '`protoyard mcp`',
      '## Back to real commands',
      '`protoyard theme list`',
    ].join('\n');
    expect(extractInvocations(markdown, 'x.md').map((i) => i.args)).toEqual([['theme', 'list']]);
  });
});

describe('checkInvocation', () => {
  it('accepts real paths, arguments, command and global flags, and --help', () => {
    expect(
      issuesFor(
        [
          '`protoyard quick "a brief" --slug s --json`',
          '`protoyard quick - --slug=s`',
          '`protoyard quick serve <slug|dir> -p 4173 --open --no-color`',
          '`protoyard new my-idea -t blank`',
          '`protoyard theme list --search warm`',
          '`protoyard theme --help` · `protoyard --version` · `protoyard quick … --slug s`',
        ].join('\n')
      )
    ).toEqual([]);
  });

  it('rejects an unknown command and an unknown subcommand', () => {
    expect(issuesFor('`protoyard deploy now`').map((i) => i.message)).toEqual([
      'unknown command `protoyard deploy`',
    ]);
    expect(issuesFor('`protoyard quick list --json`').map((i) => i.message)).toEqual([
      'unknown command `protoyard quick list`',
    ]);
    expect(issuesFor('`protoyard theme apply x`').map((i) => i.message)).toEqual([
      'unknown command `protoyard theme apply`',
    ]);
  });

  it('rejects flags the command does not have, including another command’s flags', () => {
    expect(issuesFor('`protoyard quick --screenshot`').map((i) => i.message)).toEqual([
      '`protoyard quick` has no option --screenshot',
    ]);
    expect(issuesFor('`protoyard new x --open`').map((i) => i.message)).toEqual([
      '`protoyard new` has no option --open',
    ]);
    expect(issuesFor('```sh\nprotoyard quick serve x -x\n```').map((i) => i.line)).toEqual([2]);
  });

  it('treats the word after a value-taking option as its value, not a subcommand', () => {
    expect(issuesFor('`protoyard quick --slug serve-me "a brief"`')).toEqual([]);
    expect(issuesFor('`protoyard --root ws quick serve x`')).toEqual([]);
    expect(issuesFor('`protoyard quick --json list`').map((i) => i.message)).toEqual([
      'unknown command `protoyard quick list`',
    ]);
  });
});

const REFERENCE = [
  '# Reference',
  '',
  '## Global options',
  '',
  '| Option | Meaning |',
  '| --- | --- |',
  '| `-v, --version` | version |',
  '| `--json` | json |',
  '| `--root <dir>` | root |',
  '| `--no-color` | colors |',
  '',
  '## Commands',
  '',
  '| Command | Options | What | Status |',
  '| --- | --- | --- | --- |',
  '| `protoyard quick [brief]` | `--slug <slug>` | quick | New in PLAN_004 |',
  '| `protoyard quick serve <slug\\|dir>` | `-p, --port <port>`, `--open` | serve | New |',
  '| `protoyard new <slug>` | `-t, --template <name>` | new | Released |',
  '| `protoyard theme` | — | themes | Released |',
  '| `protoyard theme list` | `--search <query>` | list | Released |',
  '',
  '## Planned (not available)',
  '',
  '| Planned command | Purpose |',
  '| --- | --- |',
  '| `protoyard quick list` · `quick open <slug>` | list |',
  '| `protoyard doctor --json` | interface |',
].join('\n');

describe('checkReference', () => {
  it('accepts a reference that matches the tree exactly', () => {
    expect(checkReference(tree, REFERENCE, 'cli.md')).toEqual([]);
  });

  it('requires every real flag of every command in its row', () => {
    const issues = checkReference(tree, REFERENCE.replace(', `--open`', ''), 'cli.md');
    expect(issues).toEqual([
      {
        file: 'cli.md',
        line: 17,
        message: '`protoyard quick serve` row is missing its option --open',
      },
    ]);
  });

  it('rejects flags a command does not have and rows for unknown commands', () => {
    const extra = REFERENCE.replace('`--slug <slug>`', '`--slug <slug>`, `--screenshot`').replace(
      '| `protoyard theme` |',
      '| `protoyard themes` |'
    );
    expect(checkReference(tree, extra, 'cli.md').map((i) => i.message)).toEqual([
      '`protoyard quick` has no option --screenshot',
      'row for unknown command `protoyard themes`',
      'no row for `protoyard theme`',
    ]);
  });

  it('requires every global option, and only real ones', () => {
    const issues = checkReference(
      tree,
      REFERENCE.replace('| `--json` | json |', '| `--verbose` | more |'),
      'cli.md'
    );
    expect(issues.map((i) => i.message)).toEqual([
      'global option --json is not listed',
      'global option --verbose does not exist',
    ]);
  });

  it('flags a planned subcommand that already exists', () => {
    const issues = checkReference(
      tree,
      REFERENCE.replace('`quick open <slug>`', '`quick serve x`'),
      'cli.md'
    );
    expect(issues.map((i) => i.message)).toEqual([
      '`protoyard quick serve` exists now; move it from Planned to New in PLAN_004',
    ]);
  });
});

describe('checkSkillCli', () => {
  const roots: string[] = [];
  afterAll(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  });

  it('walks every Markdown file under skills/protoyard and checks the reference', () => {
    const root = mkdtempSync(join(tmpdir(), 'protoyard-skill-cli-'));
    roots.push(root);
    mkdirSync(join(root, 'skills', 'protoyard', 'references'), { recursive: true });
    mkdirSync(join(root, 'skills', 'protoyard', 'quick'), { recursive: true });
    writeFileSync(join(root, 'skills', 'protoyard', 'references', 'cli.md'), REFERENCE);
    writeFileSync(
      join(root, 'skills', 'protoyard', 'quick', 'SKILL.md'),
      '`protoyard quick iterate x`\n'
    );
    expect(checkSkillCli(root, tree)).toEqual([
      {
        file: join('skills', 'protoyard', 'quick', 'SKILL.md'),
        line: 1,
        message: 'unknown command `protoyard quick iterate`',
      },
    ]);
  });

  it('passes on this repository’s skill against the real CLI', () => {
    const repo = fileURLToPath(new URL('../../../', import.meta.url));
    const real = cliTree(createProgram({ setExitCode: () => {} }));
    expect(real.paths.size).toBeGreaterThan(40);
    expect(real.paths.has('quick serve')).toBe(true);
    const skill = readFileSync(join(repo, 'skills', 'protoyard', 'quick', 'SKILL.md'), 'utf8');
    expect(extractInvocations(skill, 'quick/SKILL.md').length).toBeGreaterThan(5);
    expect(checkSkillCli(repo, real)).toEqual([]);
  });
});
