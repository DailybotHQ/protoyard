// @vitest-environment node
import { createHash as hash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createOutput } from '../src/lib/output.ts';
import { buildDigest } from '../src/lib/publish-ledger.ts';
import {
  latestShareEntries,
  parseShareLedgerEntry,
  readShareLedger,
  recordArtifactShare,
  SHARE_LEDGER_FORMAT,
  shareLedgerPath,
} from '../src/lib/share-ledger.ts';
import { createContext } from '../src/lib/workspace.ts';
import { addPrototype, type TempWorkspace } from './helpers.ts';

const URL = 'https://claude.ai/artifact/abc-123';
const roots: string[] = [];

function workspace(): TempWorkspace {
  const root = mkdtempSync(join(tmpdir(), 'protoyard-share-ledger-'));
  roots.push(root);
  writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages: []\n');
  mkdirSync(join(root, 'prototypes'), { recursive: true });
  const write = (path: string, content: string | object) => {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(
      file,
      typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`
    );
  };
  return { root, write, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function pack(ws: TempWorkspace, slug = 'share-app', content = 'bundle'): string {
  addPrototype(ws, slug);
  const outDir = join(ws.root, 'artifacts', slug, 'artifact');
  const file = {
    path: 'assets/main.js',
    bytes: Buffer.byteLength(content),
    sha256: createHash(content),
  };
  ws.write(`artifacts/${slug}/artifact/${file.path}`, content);
  ws.write(`artifacts/${slug}/artifact/page.html`, '<main>prototype</main>');
  ws.write(`artifacts/${slug}/artifact/artifact-manifest.json`, {
    format: 'protoyard.artifact-pack',
    formatVersion: 1,
    slug,
    files: [{ ...file, contentType: 'text/javascript' }],
    // The pack signs the source build (dist), which differs from the pack files.
    buildSha256: buildDigest([{ path: 'index.html', sha256: createHash('dist') }]),
    capabilities: { db: {}, user: {} },
  });
  return outDir;
}

function createHash(content: string): string {
  return hash('sha256').update(content).digest('hex');
}

function context(root: string) {
  const output = createOutput({ json: false, quiet: false, color: false });
  return createContext(root, output, false);
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('share ledger', () => {
  it('validates strict entries and refuses credential-like fields', () => {
    const entry = {
      format: SHARE_LEDGER_FORMAT,
      formatVersion: 1,
      at: '2026-10-19T12:00:00.000Z',
      slug: 'share-app',
      kind: 'artifact',
      url: URL,
      visibility: 'private',
      buildSha256: 'a'.repeat(64),
      fileCount: 2,
      commit: null,
      dirty: null,
      capabilities: ['db', 'user'],
    };
    expect(parseShareLedgerEntry(entry)).toEqual(entry);
    expect(() => parseShareLedgerEntry({ ...entry, accessToken: 'not-a-token' })).toThrow(
      /credential/i
    );
    expect(() =>
      parseShareLedgerEntry({ ...entry, url: 'https://example.com/artifact/x' })
    ).toThrow();
  });

  it('records only a current pack and appends a latest entry per slug', async () => {
    const ws = workspace();
    const outDir = pack(ws);
    const ctx = context(ws.root);
    const first = await recordArtifactShare(ctx, 'share-app', URL);
    expect(first).toMatchObject({
      format: SHARE_LEDGER_FORMAT,
      formatVersion: 1,
      slug: 'share-app',
      kind: 'artifact',
      url: URL,
      visibility: 'private',
      fileCount: 1,
      commit: null,
      dirty: null,
      capabilities: ['db', 'user'],
    });
    const second = await recordArtifactShare(
      ctx,
      'share-app',
      'https://claude.ai/code/artifact/new-id'
    );
    expect(second.url).toBe('https://claude.ai/code/artifact/new-id');
    const ledger = await readShareLedger(shareLedgerPath(ctx));
    expect(ledger.entries).toHaveLength(2);
    expect(latestShareEntries(ledger.entries)).toEqual([second]);
    expect(
      JSON.parse(readFileSync(join(outDir, 'artifact-manifest.json'), 'utf8')).files
    ).toHaveLength(1);
  });

  it('refuses a missing pack and a packed file changed after export', async () => {
    const ws = workspace();
    const ctx = context(ws.root);
    await expect(recordArtifactShare(ctx, 'missing-app', URL)).rejects.toThrow(/No prototype/);
    const outDir = pack(ws);
    writeFileSync(join(outDir, 'assets/main.js'), 'modified');
    await expect(recordArtifactShare(ctx, 'share-app', URL)).rejects.toThrow(/no longer matches/);
  });

  it('reads JSONL safely and skips invalid records', async () => {
    const ws = workspace();
    const ctx = context(ws.root);
    const path = shareLedgerPath(ctx);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, '{bad json}\n{"format":"unknown"}\n');
    expect(await readShareLedger(path)).toEqual({ entries: [], skipped: 2 });
  });
});
