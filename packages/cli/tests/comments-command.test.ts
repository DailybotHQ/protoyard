import { existsSync } from 'node:fs';
// @vitest-environment node
import { createServer } from 'node:http';
import { createReviewCommentsFile } from '@protoyard/review/report';
import { afterEach, describe, expect, it } from 'vitest';
import { sampleComment } from '../../review/tests/conformance.ts';
import { addPrototype, cli, createWorkspace, type TempWorkspace } from './helpers.ts';

const workspaces: TempWorkspace[] = [];
const servers: Array<ReturnType<typeof createServer>> = [];

afterEach(async () => {
  for (const server of servers.splice(0)) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  for (const workspace of workspaces.splice(0)) workspace.cleanup();
});

function workspace(): TempWorkspace {
  const ws = createWorkspace();
  addPrototype(ws, 'demo-app');
  workspaces.push(ws);
  return ws;
}

describe('protoyard comments', () => {
  it('rejects foreign, oversized, and non-HTTP remote sources without writing reports', async () => {
    const ws = workspace();
    const other = createReviewCommentsFile({
      namespace: 'other-app',
      slug: 'other-app',
      comments: [
        sampleComment('other-app', { id: 'comment-other-0001', threadId: 'comment-other-0001' }),
      ],
    });
    ws.write('other.json', other);
    const foreign = await cli([
      '--root',
      ws.root,
      '--json',
      'comments',
      'pull',
      'demo-app',
      '--file',
      'other.json',
      '--format',
      'md',
    ]);
    expect(foreign.code).toBe(4);

    const badUrl = await cli([
      '--root',
      ws.root,
      '--json',
      'comments',
      'pull',
      'demo-app',
      '--from',
      'javascript:alert(1)',
      '--format',
      'md',
    ]);
    expect(badUrl.code).toBe(2);
    expect(existsSync(`${ws.root}/prototypes/demo-app/docs/REVIEW.md`)).toBe(false);

    ws.write('too-big.json', ' '.repeat(5 * 1024 * 1024 + 1));
    const oversized = await cli([
      '--root',
      ws.root,
      '--json',
      'comments',
      'pull',
      'demo-app',
      '--file',
      'too-big.json',
      '--format',
      'md',
    ]);
    expect(oversized.code).toBe(4);
    expect(oversized.stdout).toContain('5 MB limit');
  });
});
