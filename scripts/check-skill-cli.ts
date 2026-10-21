/**
 * Checks the distributable skill against the real Protoyard CLI.
 *
 *   pnpm exec tsx scripts/check-skill-cli.ts      (part of `pnpm check:skill`)
 *
 * The truth source is the command tree `protoyard --help` prints, read from
 * `createProgram()` (packages/cli/src/program.ts), never a hand-kept list.
 *
 * 1. Every `protoyard …` / `pnpm protoyard …` invocation in skills/protoyard
 *    Markdown (fenced shell blocks and inline code that starts with the
 *    command) must name a real command path and only flags that command, or
 *    the global options, accept. Sections whose heading says the commands are
 *    planned or not implemented are skipped; other tools (`npx skills`,
 *    `pnpm --filter …`, `git`) are never extracted.
 * 2. The command reference (skills/protoyard/references/cli.md) is strict:
 *    one row per real command, each row's Options cell lists exactly that
 *    command's flags, the global options table lists exactly the program's
 *    options, and nothing planned is already a command.
 *
 * Exits 1 with `file:line: message` for each issue.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The parts of a commander `Command` this check reads (commander resolves from packages/cli). */
export interface CommandLike {
  name(): string;
  readonly options: readonly {
    long?: string;
    short?: string;
    required?: boolean;
    optional?: boolean;
  }[];
  readonly commands: readonly CommandLike[];
}

export interface CliNode {
  /** Long and short option spellings (`--port`, `-p`). */
  flags: Set<string>;
  /** Long option spellings only, as the reference lists them. */
  longs: Set<string>;
  /** Spellings of options that take a value (`--port <port>`, `--comments [store]`). */
  valued: Set<string>;
  subcommands: Map<string, CliNode>;
}

export interface CliTree {
  root: CliNode;
  /** Every command path below the root (`quick`, `quick serve`), in help order. */
  paths: Map<string, CliNode>;
}

export interface SkillCliIssue {
  file: string;
  line: number;
  message: string;
}

export interface Invocation {
  file: string;
  line: number;
  /** The words after `protoyard`, shell-tokenized. */
  args: string[];
}

const ALWAYS_ACCEPTED = new Set(['--help', '-h']);
const PLANNED_HEADING = /planned|not (?:yet )?(?:available|implemented)/i;
const SHELL_BREAK = new Set(['|', '||', '&&', ';', '>', '>>', '<', '2>&1', '&']);

function node(command: CommandLike): CliNode {
  const flags = new Set<string>();
  const longs = new Set<string>();
  const valued = new Set<string>();
  for (const option of command.options) {
    if (option.long) {
      flags.add(option.long);
      longs.add(option.long);
    }
    if (option.short) flags.add(option.short);
    if (option.required || option.optional) {
      for (const spelling of [option.long, option.short]) if (spelling) valued.add(spelling);
    }
  }
  const subcommands = new Map<string, CliNode>();
  for (const sub of command.commands) subcommands.set(sub.name(), node(sub));
  return { flags, longs, valued, subcommands };
}

/** The command tree of a commander program. */
export function cliTree(program: CommandLike): CliTree {
  const root = node(program);
  const paths = new Map<string, CliNode>();
  const walk = (current: CliNode, prefix: string[]) => {
    for (const [name, sub] of current.subcommands) {
      const path = [...prefix, name];
      paths.set(path.join(' '), sub);
      walk(sub, path);
    }
  };
  walk(root, []);
  return { root, paths };
}

/** Shell-like words: quotes group, `\|` (a Markdown table escape) is `|` inside a word. */
export function shellWords(text: string): string[] {
  const words: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let started = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index] as string;
    if (quote) {
      if (character === quote) quote = null;
      else current += character;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      started = true;
      current += '\u0000';
      continue;
    }
    if (character === '\\' && text[index + 1] === '|') {
      current += '|';
      started = true;
      index += 1;
      continue;
    }
    if (/\s/.test(character)) {
      if (started) words.push(current);
      current = '';
      started = false;
      continue;
    }
    current += character;
    started = true;
  }
  if (started) words.push(current);
  return words;
}

/** The words after `protoyard` when `words` run the Protoyard CLI, else null. */
function protoyardArgs(words: string[]): string[] | null {
  let index = 0;
  while (index < words.length && /^\$$|^[A-Z][A-Z0-9_]*=/.test(words[index] ?? '')) index += 1;
  if (words[index] === 'pnpm' || words[index] === 'npx') {
    index += 1;
    if (words[index] === 'exec') index += 1;
  }
  if (words[index] !== 'protoyard') return null;
  const args: string[] = [];
  for (const word of words.slice(index + 1)) {
    if (SHELL_BREAK.has(word) || word.startsWith('#')) break;
    args.push(word);
  }
  return args;
}

/** Splits a shell line at `&&`, `||` and `;` into separate commands. */
function commands(line: string): string[][] {
  const groups: string[][] = [[]];
  for (const word of shellWords(line)) {
    if (word === '&&' || word === '||' || word === ';') groups.push([]);
    else groups.at(-1)?.push(word);
  }
  return groups;
}

const SHELL_FENCE = /^(?:|sh|bash|shell|zsh|console|text)$/;

/** Every Protoyard CLI invocation in a Markdown file, outside planned sections. */
export function extractInvocations(markdown: string, file: string): Invocation[] {
  const found: Invocation[] = [];
  const lines = markdown.split(/\r?\n/);
  let planned = false;
  let fence: { shell: boolean; marker: string } | null = null;
  let pending = '';
  let pendingLine = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index] ?? '';
    const lineNumber = index + 1;
    const fenceMatch = /^\s*(```+|~~~+)\s*([A-Za-z0-9_-]*)/.exec(raw);
    if (fence) {
      if (fenceMatch?.[1]?.startsWith(fence.marker)) {
        fence = null;
        continue;
      }
      if (!fence.shell || planned) continue;
      if (!pending) pendingLine = lineNumber;
      if (raw.trimEnd().endsWith('\\')) {
        pending += `${raw.trimEnd().slice(0, -1)} `;
        continue;
      }
      const text = pending + raw;
      pending = '';
      for (const words of commands(text)) {
        const args = protoyardArgs(words);
        if (args) found.push({ file, line: pendingLine, args });
      }
      continue;
    }
    if (fenceMatch) {
      fence = {
        shell: SHELL_FENCE.test((fenceMatch[2] ?? '').toLowerCase()),
        marker: fenceMatch[1] ?? '```',
      };
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(raw);
    if (heading) {
      planned = PLANNED_HEADING.test(heading[2] ?? '');
      continue;
    }
    if (planned) continue;
    for (const span of raw.matchAll(/`([^`\n]+)`/g)) {
      for (const words of commands(span[1] ?? '')) {
        const args = protoyardArgs(words);
        if (args) found.push({ file, line: lineNumber, args });
      }
    }
  }
  return found;
}

/** A word that is a placeholder, a quoted brief, an ellipsis or stdin, not a command name. */
function isArgument(word: string): boolean {
  return !/^[a-z][a-z0-9-]*$/.test(word);
}

/** Checks one invocation's command path and flags against the tree. */
export function checkInvocation(tree: CliTree, invocation: Invocation): SkillCliIssue[] {
  const issues: SkillCliIssue[] = [];
  const at = (message: string) =>
    issues.push({ file: invocation.file, line: invocation.line, message });
  let current = tree.root;
  const path: string[] = [];
  let positional = false;
  let value = false;
  for (const word of invocation.args) {
    if (/^--?[A-Za-z]/.test(word)) {
      const [flag = word, inline] = word.split('=');
      if (!ALWAYS_ACCEPTED.has(flag) && !current.flags.has(flag) && !tree.root.flags.has(flag)) {
        at(`\`protoyard ${path.join(' ') || '(root)'}\` has no option ${flag}`);
      }
      value = inline === undefined && (current.valued.has(flag) || tree.root.valued.has(flag));
      continue;
    }
    // The word after a value-taking option is its value, never a command name.
    if (value) {
      value = false;
      continue;
    }
    if (positional || isArgument(word)) {
      positional = true;
      continue;
    }
    const sub = current.subcommands.get(word);
    if (sub) {
      current = sub;
      path.push(word);
      continue;
    }
    if (current === tree.root || current.subcommands.size > 0) {
      at(`unknown command \`protoyard ${[...path, word].join(' ')}\``);
      return issues;
    }
    positional = true;
  }
  return issues;
}

function section(markdown: string, heading: string): { body: string; offset: number } | null {
  const start = markdown.indexOf(`\n${heading}\n`);
  if (start < 0) return null;
  const end = markdown.indexOf('\n## ', start + heading.length + 1);
  const body = markdown.slice(start + 1, end < 0 ? undefined : end);
  return { body, offset: markdown.slice(0, start + 1).split('\n').length - 1 };
}

const LONG_FLAG = /--[a-z][a-z0-9-]*/g;

/** The strict reference check for skills/protoyard/references/cli.md. */
export function checkReference(tree: CliTree, markdown: string, file: string): SkillCliIssue[] {
  const issues: SkillCliIssue[] = [];
  const at = (line: number, message: string) => issues.push({ file, line, message });

  const globals = section(markdown, '## Global options');
  if (!globals) at(1, 'missing the "## Global options" section');
  else {
    const listed = new Set<string>();
    globals.body.split('\n').forEach((text) => {
      const match = /^\| `([^`]+)` \|/.exec(text);
      for (const flag of match?.[1]?.match(LONG_FLAG) ?? []) listed.add(flag);
    });
    for (const flag of tree.root.longs) {
      if (!listed.has(flag)) at(globals.offset + 1, `global option ${flag} is not listed`);
    }
    for (const flag of listed) {
      if (!tree.root.longs.has(flag))
        at(globals.offset + 1, `global option ${flag} does not exist`);
    }
  }

  const table = section(markdown, '## Commands');
  if (!table) {
    at(1, 'missing the "## Commands" section');
    return issues;
  }
  const rows = new Map<string, number>();
  table.body.split('\n').forEach((text, index) => {
    const line = table.offset + index + 1;
    const match = /^\| `protoyard ([^`]+)` \| ([^|]*(?:\\\|[^|]*)*) \|/.exec(text);
    if (!match) return;
    const words = (match[1] ?? '').split(/\s+/).filter((word) => !isArgument(word));
    const path = words.join(' ');
    const command = tree.paths.get(path);
    if (!command) {
      at(line, `row for unknown command \`protoyard ${path}\``);
      return;
    }
    if (rows.has(path)) at(line, `second row for \`protoyard ${path}\``);
    rows.set(path, line);
    const listed = new Set((match[2] ?? '').match(LONG_FLAG) ?? []);
    for (const flag of command.longs) {
      if (!listed.has(flag)) at(line, `\`protoyard ${path}\` row is missing its option ${flag}`);
    }
    for (const flag of listed) {
      if (!command.longs.has(flag)) at(line, `\`protoyard ${path}\` has no option ${flag}`);
    }
  });
  for (const path of tree.paths.keys()) {
    if (!rows.has(path)) at(table.offset + 1, `no row for \`protoyard ${path}\``);
  }

  const planned = section(markdown, '## Planned (not available)');
  if (planned) {
    planned.body.split('\n').forEach((text, index) => {
      for (const span of text.matchAll(/`([^`\n]+)`/g)) {
        const words = shellWords(span[1] ?? '');
        const args = words[0] === 'protoyard' ? words.slice(1) : words;
        const head: string[] = [];
        for (const word of args) {
          if (isArgument(word) || word.startsWith('-')) break;
          head.push(word);
        }
        // A planned subcommand (`quick list`) must not exist yet; `doctor --json`
        // plans a new interface on an existing command, not a new command path.
        while (head.length > 1 && !tree.paths.has(head.join(' '))) head.pop();
        if (head.length > 1) {
          at(
            planned.offset + index + 1,
            `\`protoyard ${head.join(' ')}\` exists now; move it from Planned to New since 1.0.0`
          );
        }
      }
    });
  }
  return issues;
}

function markdownFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory).sort()) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) files.push(...markdownFiles(path));
    else if (entry.endsWith('.md')) files.push(path);
  }
  return files;
}

/** Runs every check over a repository's skills/protoyard tree. */
export function checkSkillCli(root: string, tree: CliTree): SkillCliIssue[] {
  const skillRoot = join(root, 'skills', 'protoyard');
  const issues: SkillCliIssue[] = [];
  for (const path of markdownFiles(skillRoot)) {
    const file = relative(root, path);
    const markdown = readFileSync(path, 'utf8');
    for (const invocation of extractInvocations(markdown, file)) {
      issues.push(...checkInvocation(tree, invocation));
    }
    if (file === join('skills', 'protoyard', 'references', 'cli.md')) {
      issues.push(...checkReference(tree, markdown, file));
    }
  }
  return issues;
}

async function main(): Promise<number> {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const { createProgram } = await import('../packages/cli/src/program.ts');
  const tree = cliTree(createProgram({ setExitCode: () => {} }));
  const issues = checkSkillCli(root, tree);
  for (const issue of issues) console.log(`${issue.file}:${issue.line}: ${issue.message}`);
  if (issues.length > 0) {
    console.log(`FAIL: ${issues.length} skill/CLI mismatch(es)`);
    return 1;
  }
  console.log(`OK: skills/protoyard matches the CLI (${tree.paths.size} commands)`);
  return 0;
}

const entry = process.argv[1] ? resolve(process.argv[1]) : '';
if (entry === resolve(fileURLToPath(import.meta.url))) process.exitCode = await main();
