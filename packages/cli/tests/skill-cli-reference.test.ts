// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Command } from 'commander';
import { describe, expect, it } from 'vitest';
import { createProgram } from '../src/program.ts';

/**
 * skills/protoyard/references/cli.md stays true to the real command tree:
 * every command has a row, every row's command and flags exist, and nothing
 * listed as planned is already a command (its row would then be stale).
 */

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const DOC = readFileSync(join(REPO, 'skills', 'protoyard', 'references', 'cli.md'), 'utf8');

function tree(): Map<string, Set<string>> {
  const commands = new Map<string, Set<string>>();
  const walk = (cmd: Command, prefix: string[]) => {
    for (const sub of cmd.commands) {
      const path = [...prefix, sub.name()];
      commands.set(path.join(' '), new Set(sub.options.map((o) => o.long ?? '').filter(Boolean)));
      walk(sub, path);
    }
  };
  walk(createProgram({ setExitCode: () => {} }), []);
  return commands;
}

/** `| \`protoyard a b <x>\` | \`--f <v>\`, … | … | Status |` rows of the command tables. */
function documentedRows(section: string): { path: string; flags: string[] }[] {
  const start = DOC.indexOf(section);
  const end = DOC.indexOf('\n## ', start + section.length);
  const body = DOC.slice(start, end === -1 ? undefined : end);
  const rows: { path: string; flags: string[] }[] = [];
  for (const line of body.split('\n')) {
    const match = /^\| `protoyard ([a-z][a-z-]*(?: [a-z][a-z-]*)*)[^`]*` \| ([^|]*) \|/.exec(line);
    if (!match) continue;
    rows.push({
      path: match[1] ?? '',
      flags: [...(match[2] ?? '').matchAll(/--[a-z][a-z0-9-]*/g)].map((m) => m[0]),
    });
  }
  return rows;
}

describe('the skill CLI reference', () => {
  const commands = tree();
  const documented = documentedRows('## Commands');

  it('has a row for every command and subcommand of the real CLI', () => {
    const paths = new Set(documented.map((r) => r.path));
    expect(commands.size).toBeGreaterThan(40);
    for (const path of commands.keys()) expect(paths, path).toContain(path);
  });

  it('documents only commands and flags the CLI really has', () => {
    for (const row of documented) {
      const flags = commands.get(row.path);
      expect(flags, row.path).toBeDefined();
      for (const flag of row.flags) {
        // `--no-x` options register as `--no-x`; every documented flag must exist.
        expect(flags?.has(flag), `${row.path} ${flag}`).toBe(true);
      }
    }
  });

  it('lists as planned only commands that do not exist yet', () => {
    // The loose parser really reads tables: it finds the quick commands in the command tables.
    expect(documentedRowsLoose('## Commands').length).toBeGreaterThan(10);
    const planned = documentedRowsLoose('## Planned (not available)');
    for (const path of planned) expect(commands.has(path), path).toBe(false);
    // Once every planned command has landed, the section must say so instead of going quiet.
    if (planned.length === 0) {
      expect(sectionBody('## Planned (not available)')).toMatch(/No commands are planned/);
    }
  });
});

/** The text of a `## ` section, up to the next one; empty when the heading is missing. */
function sectionBody(section: string): string {
  const start = DOC.indexOf(section);
  if (start === -1) return '';
  const end = DOC.indexOf('\n## ', start + section.length);
  return DOC.slice(start, end === -1 ? undefined : end);
}

/** Command paths named anywhere in a section's table (`protoyard quick serve`, `quick list`). */
function documentedRowsLoose(section: string): string[] {
  const body = sectionBody(section);
  const paths = new Set<string>();
  for (const match of body.matchAll(/`(?:protoyard )?((?:quick|doctor|mcp)(?: [a-z]+)?)[ `]/g)) {
    const path = (match[1] ?? '').trim();
    // `doctor` exists; only its planned `--json` interface is new, which is not a command path.
    if (path === 'doctor' || path === 'quick') continue;
    paths.add(path);
  }
  return [...paths];
}

describe('the distributable skill pack', () => {
  it('never mentions internal plan or task ids', () => {
    const pack = fileURLToPath(new URL('../../../skills/protoyard/', import.meta.url));
    const hits = (readdirSync(pack, { recursive: true }) as string[])
      .filter((file) => file.endsWith('.md'))
      .filter((file) =>
        /\bPLAN_\d{3}\b|\bT-[a-z]+-[a-z-]+\b/.test(readFileSync(join(pack, file), 'utf8'))
      );
    // Users read this pack; status labels are "New since <version>", never a plan name.
    expect(hits).toEqual([]);
  });
});
