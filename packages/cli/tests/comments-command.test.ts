import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
// @vitest-environment node
import { createServer } from 'node:http';
import { ReviewCommentSchema } from '@protoyard/core/review';
import { createReviewCommentsFile, parseReviewCommentsFile } from '@protoyard/review/report';
import { createMemoryCommentsStore, handleCommentsRequest } from '@protoyard/review/server';
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

async function serveComments(comments: ReturnType<typeof sampleComment>[], key?: string) {
  const store = createMemoryCommentsStore();
  for (const comment of comments) await store.put(ReviewCommentSchema.parse(comment));
  let port = 0;
  const server = createServer((request, response) => {
    const url = `http://127.0.0.1:${port}${request.url ?? '/'}`;
    void handleCommentsRequest(
      new Request(url, { method: request.method, headers: request.headers as HeadersInit }),
      { ...(key ? { REVIEW_KEY: key } : {}) },
      store
    ).then(async (result) => {
      response.writeHead(result.status, Object.fromEntries(result.headers.entries()));
      response.end(await result.text());
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Test server did not bind a TCP port.');
  port = address.port;
  return { url: `http://127.0.0.1:${address.port}/api/comments`, store, server };
}

describe('protoyard comments', () => {
  it('pulls from a local comments handler with GET, key header, files, and safe Markdown', async () => {
    const ws = workspace();
    const comment = sampleComment('demo-app', {
      id: 'comment-cli-0001',
      threadId: 'comment-cli-0001',
      body: '# Injected heading\n[click](https://evil.example) <img src=x onerror=alert(1)>',
    });
    const key = 'fictional-review-key';
    const endpoint = await serveComments([comment], key);
    const seen: string[] = [];
    endpoint.server.on('request', (request) => {
      seen.push(`${request.method}:${request.headers['x-review-key'] ?? ''}`);
    });

    const result = await cli(
      [
        '--root',
        ws.root,
        '--json',
        'comments',
        'pull',
        'demo-app',
        '--from',
        endpoint.url,
        '--format',
        'md',
      ],
      { PROTOYARD_REVIEW_KEY: key }
    );

    expect(result.code).toBe(0);
    const envelope = result.json<{ data: { comments: number; report: string; data: string } }>();
    expect(envelope.data.comments).toBe(1);
    expect(seen).toEqual(['GET:fictional-review-key']);
    expect(result.stdout).not.toContain(key);
    const markdown = await readFile(`${ws.root}/${envelope.data.report}`, 'utf8');
    expect(markdown).toContain('## Open');
    expect(markdown).toContain('### Screen `/deals/7`');
    expect(markdown).toContain('> \\# Injected heading');
    expect(markdown).toContain('\\[click\\]');
    expect(markdown).toContain('&lt;img src=x onerror=alert\\(1\\)&gt;');
    expect(markdown).toContain('?scenario=busy-quarter#/deals/7');
    expect(markdown).not.toContain('<img');
    const pulled = JSON.parse(await readFile(`${ws.root}/${envelope.data.data}`, 'utf8')) as {
      pulledAt: string;
      comments: unknown[];
    };
    expect(pulled.pulledAt).toMatch(/^\d{4}-/);
    expect(pulled.comments).toHaveLength(1);
  });

  it('pulls and validates the local adapter file format', async () => {
    const ws = workspace();
    const comment = sampleComment('demo-app', {
      id: 'comment-file-0001',
      threadId: 'comment-file-0001',
    });
    const file = createReviewCommentsFile({
      namespace: 'demo-app',
      slug: 'demo-app',
      comments: [comment],
    });
    ws.write('local-review.json', file);

    const result = await cli([
      '--root',
      ws.root,
      '--json',
      'comments',
      'pull',
      'demo-app',
      '--file',
      'local-review.json',
      '--format',
      'json',
    ]);

    expect(result.code).toBe(0);
    expect(result.json<{ data: { source: string; comments: number } }>().data).toMatchObject({
      source: 'file',
      comments: 1,
    });
    expect(await readFile(`${ws.root}/prototypes/demo-app/docs/REVIEW.md`, 'utf8')).toContain(
      'The total looks off on this card\\.'
    );
    await expect(
      cli([
        '--root',
        ws.root,
        '--json',
        'comments',
        'pull',
        'demo-app',
        '--file',
        'local-review.json',
        '--from',
        'http://127.0.0.1:1/api/comments',
        '--format',
        'md',
      ])
    ).resolves.toMatchObject({ code: 2 });
  });

  it('imports and exports the local adapter envelope without pull-only metadata', async () => {
    const ws = workspace();
    const comment = sampleComment('demo-app', {
      id: 'comment-xfer-0001',
      threadId: 'comment-xfer-0001',
    });
    const file = createReviewCommentsFile({
      namespace: 'demo-app',
      slug: 'demo-app',
      comments: [comment],
    });
    ws.write('handoff.json', file);

    const imported = await cli([
      '--root',
      ws.root,
      '--json',
      'comments',
      'import',
      'demo-app',
      'handoff.json',
    ]);
    expect(imported.code).toBe(0);
    const data = imported.json<{ data: { file: string } }>().data;
    const pulledSidecar = JSON.parse(await readFile(`${ws.root}/${data.file}`, 'utf8')) as {
      pulledAt: string;
    };
    expect(pulledSidecar.pulledAt).toMatch(/^\d{4}-/);

    const exported = await cli(['--root', ws.root, '--json', 'comments', 'export', 'demo-app']);
    expect(exported.code).toBe(0);
    const output = exported.json<{ data: { file: string } }>().data.file;
    const localExport = parseReviewCommentsFile(
      JSON.parse(await readFile(`${ws.root}/${output}`, 'utf8')),
      { slug: 'demo-app', namespace: 'demo-app' }
    );
    expect(localExport.comments).toHaveLength(1);
  });

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
