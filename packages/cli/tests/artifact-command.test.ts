// @vitest-environment node
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { buildDigest } from '../src/lib/publish-ledger.ts';
import { addPrototype, cli, createWorkspace, type TempWorkspace } from './helpers.ts';

const URL = 'https://claude.ai/artifact/abc-123';
let ws: TempWorkspace;

function addPack(workspace: TempWorkspace, slug = 'share-app') {
  addPrototype(workspace, slug);
  const content = 'bundle';
  const file = {
    path: 'assets/main.js',
    bytes: Buffer.byteLength(content),
    sha256: createHash('sha256').update(content).digest('hex'),
  };
  workspace.write(`artifacts/${slug}/artifact/${file.path}`, content);
  workspace.write(`artifacts/${slug}/artifact/page.html`, '<main>prototype</main>');
  workspace.write(`artifacts/${slug}/artifact/artifact-manifest.json`, {
    format: 'protoyard.artifact-pack',
    formatVersion: 1,
    slug,
    files: [{ ...file, contentType: 'text/javascript' }],
    buildSha256: buildDigest([file]),
    capabilities: { db: {}, user: {} },
  });
}

afterEach(() => ws?.cleanup());

describe('artifact CLI commands', () => {
  it('records a private share and lists the latest entry for each slug', async () => {
    ws = createWorkspace();
    addPack(ws);
    const first = await cli([
      '--root',
      ws.root,
      '--json',
      'artifact',
      'record',
      'share-app',
      '--url',
      URL,
    ]);
    expect(first.code).toBe(0);
    expect(first.json<{ data: { entry: Record<string, unknown> } }>().data.entry).toMatchObject({
      slug: 'share-app',
      kind: 'artifact',
      url: URL,
      visibility: 'private',
      fileCount: 1,
    });
    const secondUrl = 'https://claude.ai/code/artifact/def-456';
    const second = await cli([
      '--root',
      ws.root,
      'artifact',
      'record',
      'share-app',
      '--url',
      secondUrl,
      '--json',
    ]);
    expect(second.code).toBe(0);
    const listed = await cli(['--root', ws.root, 'artifact', 'list', '--json']);
    expect(listed.code).toBe(0);
    const data = listed.json<{ data: { entries: Array<{ url: string }> } }>().data;
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0]?.url).toBe(secondUrl);
  });

  it('rejects non-Claude URLs and does not create a ledger entry', async () => {
    ws = createWorkspace();
    addPack(ws);
    const result = await cli([
      '--root',
      ws.root,
      '--json',
      'artifact',
      'record',
      'share-app',
      '--url',
      'https://example.com/artifact/not-real',
    ]);
    expect(result.code).toBe(4);
    expect(result.json<{ error: { message: string } }>().error.message).toMatch(
      /Claude artifact URL/
    );
    const listed = await cli(['--root', ws.root, '--json', 'artifact', 'list']);
    expect(listed.json<{ data: { total: number } }>().data.total).toBe(0);
  });

  it('requires an existing artifact pack', async () => {
    ws = createWorkspace();
    addPrototype(ws, 'share-app');
    const result = await cli([
      '--root',
      ws.root,
      '--json',
      'artifact',
      'record',
      'share-app',
      '--url',
      URL,
    ]);
    expect(result.code).toBe(4);
    expect(result.json<{ error: { message: string } }>().error.message).toMatch(
      /No Claude artifact pack manifest/
    );
  });
});
