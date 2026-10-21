// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkInvocation, cliTree, extractInvocations } from '../../../scripts/check-skill-cli.ts';
import { createProgram } from '../src/program.ts';

/**
 * docs/QUICK.md, the quick workflow guide: every command it shows runs (a real
 * command with real flags), it and DEVELOPMENT_COMMANDS cover every `quick`
 * subcommand, and its relative links and in-page anchors resolve.
 */

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const GUIDE = join(REPO, 'docs', 'QUICK.md');
const text = readFileSync(GUIDE, 'utf8');
const program = createProgram({ setExitCode: () => {} });
const tree = cliTree(program);
const quickSubcommands = (
  program.commands.find((cmd) => cmd.name() === 'quick')?.commands ?? []
).map((cmd) => cmd.name());

const anchors = new Set(
  [...text.matchAll(/^#{1,6} (.+)$/gm)].map(([, heading]) =>
    (heading ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, '')
      .replace(/\s/g, '-')
  )
);

describe('docs/QUICK.md', () => {
  it('shows only commands and flags the real CLI has', () => {
    const invocations = extractInvocations(text, 'docs/QUICK.md');
    expect(invocations.length).toBeGreaterThan(20);
    expect(invocations.flatMap((invocation) => checkInvocation(tree, invocation))).toEqual([]);
  });

  it('covers every quick subcommand, and so does DEVELOPMENT_COMMANDS', () => {
    expect(quickSubcommands.length).toBeGreaterThanOrEqual(12);
    const commands = readFileSync(join(REPO, 'docs', 'DEVELOPMENT_COMMANDS.md'), 'utf8');
    for (const name of quickSubcommands) {
      expect(text, `QUICK.md: quick ${name}`).toContain(`quick ${name}`);
      expect(commands, `DEVELOPMENT_COMMANDS.md: quick ${name}`).toContain(`quick ${name}`);
    }
  });

  it('walks the loop in order: brief → variants → shot → iterate → feedback → report → promote → prune', () => {
    const order = [
      'quick "',
      '--variants',
      'quick shot',
      'quick iterate',
      'quick feedback',
      'quick report',
      'quick promote',
      'quick prune',
    ];
    const loop = text.slice(text.indexOf('## The loop'));
    const positions = order.map((needle) => loop.indexOf(needle));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('has resolving relative links and in-page anchors', () => {
    for (const [, target, anchor] of text.matchAll(/\]\(([^)#\s]*)(?:#([^)\s]*))?\)/g)) {
      if (/^[a-z]+:/.test(target ?? '')) continue;
      if (target) {
        expect(existsSync(resolve(dirname(GUIDE), target)), target).toBe(true);
      } else if (anchor) {
        expect(anchors.has(anchor), `#${anchor}`).toBe(true);
      }
    }
  });
});
