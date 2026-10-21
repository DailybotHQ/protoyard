// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { cli, createWorkspace, type TempWorkspace } from './helpers.ts';

const QUICK_COMMANDS = [
  { name: 'quick', args: ['quick'] },
  { name: 'quick serve', args: ['quick', 'serve', 'missing-board'] },
  { name: 'quick shot', args: ['quick', 'shot', 'missing-board'] },
  { name: 'quick export', args: ['quick', 'export', 'missing-board'] },
  { name: 'quick promote', args: ['quick', 'promote', 'missing-board', 'new-board'] },
  { name: 'quick iterate', args: ['quick', 'iterate', 'missing-board'] },
  { name: 'quick undo', args: ['quick', 'undo', 'missing-board'] },
  { name: 'quick report', args: ['quick', 'report', 'missing-board'] },
  { name: 'quick feedback', args: ['quick', 'feedback', 'missing-board'] },
  { name: 'quick list', args: ['quick', 'list'] },
  { name: 'quick open', args: ['quick', 'open', 'missing-board'] },
  { name: 'quick index', args: ['quick', 'index'] },
  { name: 'quick prune', args: ['quick', 'prune'] },
] as const;

let ws: TempWorkspace;
afterEach(() => ws?.cleanup());

describe('quick JSON envelopes', () => {
  it('freezes the machine-readable envelope for every quick command', async () => {
    ws = createWorkspace();
    const envelopes = [];
    for (const { name, args } of QUICK_COMMANDS) {
      const result = await cli(['--json', ...args], { PROTOYARD_ROOT: ws.root });
      const value = result.json<Record<string, unknown>>();
      expect(value).toMatchObject({ ok: expect.any(Boolean), command: name });
      expect(Object.keys(value).sort()).toEqual(
        Object.keys(value)
          .filter((key) => ['ok', 'command', 'data', 'error'].includes(key))
          .sort()
      );
      if (value.ok) {
        expect(value).toHaveProperty('data');
        expect(value).not.toHaveProperty('error');
        envelopes.push({
          ok: true,
          command: value.command,
          dataKeys: Object.keys(value.data as object).sort(),
        });
      } else {
        expect(value).toHaveProperty('error.code');
        expect(value).toHaveProperty('error.message');
        envelopes.push({
          ok: false,
          command: value.command,
          error: {
            code: (value.error as { code: string }).code,
            hasHint: 'hint' in (value.error as object),
          },
        });
      }
    }
    expect(envelopes).toMatchSnapshot();
  });
});
