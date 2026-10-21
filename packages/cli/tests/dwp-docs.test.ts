// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkInvocation, cliTree, extractInvocations } from '../../../scripts/check-skill-cli.ts';
import { createProgram } from '../src/program.ts';

/**
 * docs/DWP.md stays true to the code and the addon packet: every
 * `protoyard …` command it shows exists with those flags, its gate table
 * follows the gates template in order, its pins match addon.json, and every
 * relative link resolves.
 */

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const DOC_PATH = join(REPO, 'docs', 'DWP.md');
const DOC = readFileSync(DOC_PATH, 'utf8');
const PACKET = join(REPO, 'integrations', 'deepworkplan', 'protoyard');

describe('docs/DWP.md', () => {
  it('uses only commands and flags the real CLI has', () => {
    const tree = cliTree(createProgram({ setExitCode: () => {} }));
    const invocations = extractInvocations(DOC, 'docs/DWP.md');
    const commands = new Set(
      invocations.map((i) =>
        i.args
          .filter((a) => /^[a-z]/.test(a))
          .slice(0, 2)
          .join(' ')
      )
    );
    for (const expected of [
      'quick',
      'quick serve',
      'quick shot',
      'quick promote',
      'blueprint validate',
      'validate',
      'doctor',
    ]) {
      expect(
        [...commands].some((command) => command.startsWith(expected)),
        expected
      ).toBe(true);
    }
    expect(invocations.flatMap((invocation) => checkInvocation(tree, invocation))).toEqual([]);
  });

  it('lists the gates of the gates template, in order, with the required ones first', () => {
    const template = readFileSync(join(PACKET, 'templates', 'EXPLORATION_GATES.md'), 'utf8');
    const gates = [...template.matchAll(/^## Gate (\d+) — (.+)$/gm)].map((m) => Number(m[1]));
    const start = DOC.indexOf('## 3. Run the gates, in order');
    const table = DOC.slice(start, DOC.indexOf('\n## ', start + 1));
    const rows = [...table.matchAll(/^\| (\d+)\. /gm)].map((m) => Number(m[1]));
    expect(rows).toEqual(gates);
    expect(table).toContain('Gates 1–6 are required');
  });

  it('states the output scope, the promotion boundary, the evidence boundary and the GO', () => {
    expect(DOC).toContain('<plan>/analysis_results/prototypes/<slug>/');
    expect(DOC).toContain('## 6. Promote only after a decision');
    expect(DOC).toContain('The addon never promotes.');
    expect(DOC).toContain('## Evidence boundary');
    expect(DOC).toMatch(/separate, explicit\s+developer \*\*GO\*\*/);
    expect(DOC).toContain('Protoyard does not install DeepWorkPlan');
  });

  it('pins the same product release and interface as addon.json', () => {
    const descriptor = JSON.parse(readFileSync(join(PACKET, 'addon.json'), 'utf8')) as {
      product: { repo: string; tag: string; interface: number };
      detect: { command: string };
    };
    expect(DOC).toContain(`\`${descriptor.product.repo}\` at \`${descriptor.product.tag}\``);
    expect(DOC).toContain(`machine interface \`${descriptor.product.interface}\``);
    expect(DOC).toContain(descriptor.detect.command);
    expect(DOC).toContain(`--version ${descriptor.product.tag}`);
  });

  it('links only to files that exist, and names no absolute local path', () => {
    for (const [, target] of DOC.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)) {
      if (/^[a-z]+:/.test(target ?? '')) continue;
      expect(existsSync(resolve(dirname(DOC_PATH), target ?? '')), target).toBe(true);
    }
    expect(DOC).not.toMatch(/(?:^|[\s`(])(?:\/Users\/|\/home\/[a-z])/m);
  });
});
