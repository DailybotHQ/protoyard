// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sha256Text } from '../src/lib/checksum.ts';
import { CliError } from '../src/lib/output.ts';
import {
  createQuickRecord,
  parseQuickRecord,
  QUICK_FILE,
  QUICK_FILE_MAX_BYTES,
  QUICK_FORMAT,
  type QuickRecord,
  readQuickRecord,
  touchQuickRecord,
  writeQuickRecord,
} from '../src/lib/quick/model.ts';

const NOW = () => new Date('2026-10-20T12:00:00.000Z');
const LATER = () => new Date('2026-10-21T08:30:00.000Z');
const BRIEF = 'A fictional field service team schedules inspections and tracks each visit.';
const SHA = 'a'.repeat(64);

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'protoyard-quick-model-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function base(overrides: Partial<Parameters<typeof createQuickRecord>[0]> = {}): QuickRecord {
  return createQuickRecord({
    slug: 'field-visits',
    brief: BRIEF,
    blueprintSha256: SHA,
    player: { version: '1.0.0', standalone: false },
    now: NOW,
    ...overrides,
  });
}

function full(): QuickRecord {
  return {
    ...base({ seed: 'seed-1' }),
    variants: [
      { id: 'v1', label: 'Sidebar, Nord theme', dir: 'v1', blueprintSha256: 'b'.repeat(64) },
      { id: 'v2', label: 'Top bar, compact', dir: 'v2', blueprintSha256: 'c'.repeat(64) },
    ],
    screenshots: {
      files: [
        {
          variant: 'v1',
          path: 'shots/v1-desktop.png',
          width: 1280,
          height: 800,
          bytes: 41_200,
          sha256: 'd'.repeat(64),
          capturedAt: '2026-10-20T12:01:00.000Z',
        },
      ],
      skipped: null,
    },
    shares: [
      {
        kind: 'artifact',
        url: 'https://claude.ai/artifact/abc-123',
        visibility: 'private',
        variant: 'v2',
        sha256: 'e'.repeat(64),
        at: '2026-10-20T12:02:00.000Z',
      },
    ],
    promotedTo: { slug: 'field-visits-demo', variant: 'v1', at: '2026-10-20T13:00:00.000Z' },
  };
}

function at<T>(list: readonly T[], index: number): T {
  const item = list[index];
  if (item === undefined) throw new Error(`No item ${index}`);
  return item;
}

function expectInvalid(value: unknown, message: RegExp) {
  let error: unknown;
  try {
    parseQuickRecord(value);
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(CliError);
  expect((error as CliError).code).toBe('validation');
  expect((error as CliError).message).toMatch(message);
}

describe('createQuickRecord', () => {
  it('records the brief hash, length and text, with a deterministic clock', () => {
    const record = base();
    expect(record).toMatchObject({
      format: QUICK_FORMAT,
      formatVersion: 1,
      source: 'brief',
      brief: { sha256: sha256Text(BRIEF), chars: BRIEF.length, text: BRIEF },
      createdAt: '2026-10-20T12:00:00.000Z',
      updatedAt: '2026-10-20T12:00:00.000Z',
      variants: [],
      screenshots: { files: [], skipped: null },
      shares: [],
      promotedTo: null,
      seed: null,
    });
    expect(base()).toEqual(record);
  });

  it('never keeps the brief text with --no-store-brief', () => {
    const record = base({ storeBrief: false });
    expect(record.brief).toEqual({ sha256: sha256Text(BRIEF), chars: BRIEF.length, text: null });
    expect(JSON.stringify(record)).not.toContain('field service');
  });

  it('records a blueprint source without a brief', () => {
    const record = base({ brief: undefined });
    expect(record.source).toBe('blueprint');
    expect(record.brief).toBeNull();
  });

  it('touch moves only updatedAt', () => {
    const touched = touchQuickRecord(base(), LATER);
    expect(touched.updatedAt).toBe('2026-10-21T08:30:00.000Z');
    expect(touched.createdAt).toBe('2026-10-20T12:00:00.000Z');
  });
});

describe('quick.json round trip', () => {
  it('writes and reads back an identical record, atomically', async () => {
    const record = full();
    await writeQuickRecord(dir, record);
    expect(await readQuickRecord(dir)).toEqual(record);
    expect(readFileSync(join(dir, QUICK_FILE), 'utf8').endsWith('\n')).toBe(true);
  });

  it('refuses to write an invalid record and leaves no file', async () => {
    await expect(writeQuickRecord(dir, { ...base(), slug: '../x' })).rejects.toThrow(/slug/);
    expect(() => readFileSync(join(dir, QUICK_FILE))).toThrow();
  });
});

describe('rejecting malformed and future files', () => {
  it('refuses a newer format version with an upgrade hint', () => {
    let error: unknown;
    try {
      parseQuickRecord({ ...full(), formatVersion: 2 });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(CliError);
    expect((error as CliError).message).toMatch(/format version 2/);
    expect((error as CliError).hint).toMatch(/Upgrade/);
  });

  it('refuses other formats, versions, shapes and unknown keys', () => {
    expectInvalid(null, /not a JSON object/);
    expectInvalid([], /not a JSON object/);
    expectInvalid({ ...full(), format: 'protoyard.share-ledger' }, /format is not/);
    expectInvalid({ ...full(), formatVersion: 0 }, /formatVersion/);
    expectInvalid({ ...full(), formatVersion: '1' }, /formatVersion/);
    expectInvalid({ ...full(), extra: true }, /extra|Unrecognized/i);
    expectInvalid({ ...full(), blueprintSha256: 'nope' }, /blueprintSha256/);
    expectInvalid({ ...full(), createdAt: 'yesterday' }, /createdAt/);
    expectInvalid({ ...full(), player: { version: 'latest', standalone: false } }, /player/);
  });

  it('refuses paths that escape the exploration folder', () => {
    for (const path of ['../x.png', '/abs.png', 'a\\b.png', 'shots/./x.png', 'shots/x.jpg']) {
      const record = full();
      record.screenshots.files[0] = { ...at(record.screenshots.files, 0), path };
      expectInvalid(record, /screenshots/);
    }
    const record = full();
    record.variants[0] = { ...at(record.variants, 0), dir: '../v1' };
    expectInvalid(record, /variants/);
  });

  it('refuses duplicate and dangling variant references', () => {
    const dup = full();
    dup.variants[1] = { ...at(dup.variants, 1), id: 'v1' };
    expectInvalid(dup, /unique/);
    expectInvalid(
      { ...full(), promotedTo: { slug: 'x-one', variant: 'v7', at: NOW().toISOString() } },
      /Unknown variant v7/
    );
    expectInvalid({ ...full(), variants: [] }, /Unknown variant/);
  });

  it('refuses a brief source without a brief, non-artifact shares and credential-like keys', () => {
    expectInvalid({ ...full(), brief: null }, /brief/);
    const share = full();
    share.shares[0] = { ...at(share.shares, 0), url: 'https://example.com/a' };
    expectInvalid(share, /shares/);
    expectInvalid({ ...full(), apiToken: 'x' }, /credentials/);
  });

  it('reads only a regular, size-capped, valid JSON file', async () => {
    await expect(readQuickRecord(dir)).rejects.toMatchObject({ code: 'not_found' });
    writeFileSync(join(dir, QUICK_FILE), '{nope');
    await expect(readQuickRecord(dir)).rejects.toThrow(/not valid JSON/);
    writeFileSync(join(dir, QUICK_FILE), ' '.repeat(QUICK_FILE_MAX_BYTES + 1));
    await expect(readQuickRecord(dir)).rejects.toThrow(/limit/);
    rmSync(join(dir, QUICK_FILE));
    const other = join(dir, 'elsewhere.json');
    writeFileSync(other, JSON.stringify(full()));
    symlinkSync(other, join(dir, QUICK_FILE));
    await expect(readQuickRecord(dir)).rejects.toThrow(/not a regular file/);
    rmSync(join(dir, QUICK_FILE));
    mkdirSync(join(dir, QUICK_FILE));
    await expect(readQuickRecord(dir)).rejects.toThrow(/not a regular file/);
  });
});
