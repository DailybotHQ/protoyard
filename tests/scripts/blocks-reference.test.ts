// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderBlockCatalogMarkdown } from '../../packages/blocks/src/catalog/index.ts';
import {
  BEGIN_MARKER,
  BLOCKS_DOC,
  END_MARKER,
  findRegion,
  firstDifference,
  ReferenceRegionError,
  regionIsCurrent,
  replaceRegion,
  run,
} from '../../scripts/blocks-reference.ts';

const NARRATIVE_TOP = '';
const NARRATIVE_BOTTOM = '\n# Authoring and rendering blocks\n\nHand-written narrative.\n';
const doc = (generated: string) =>
  `${NARRATIVE_TOP}${BEGIN_MARKER}\n${generated}${END_MARKER}\n${NARRATIVE_BOTTOM}`;

const dirs: string[] = [];
function tempDoc(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'blocks-reference-'));
  dirs.push(dir);
  const file = join(dir, 'BLOCKS.md');
  writeFileSync(file, content);
  return file;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('blocks-reference region handling', () => {
  it('replaces only the generated region and keeps the narrative byte for byte', () => {
    const before = doc('old reference\n');
    const after = replaceRegion(before, 'new reference\n');
    expect(after).toBe(doc('new reference\n'));
    expect(after.endsWith(NARRATIVE_BOTTOM)).toBe(true);
    expect(replaceRegion(before, 'no trailing newline')).toBe(doc('no trailing newline\n'));
  });

  it('is idempotent and reports when the region is current', () => {
    const current = doc('same\n');
    expect(regionIsCurrent(current, 'same\n')).toBe(true);
    expect(regionIsCurrent(current, 'changed\n')).toBe(false);
    expect(replaceRegion(replaceRegion(current, 'x\n'), 'x\n')).toBe(replaceRegion(current, 'x\n'));
  });

  it.each([
    ['no markers', 'just prose\n'],
    ['two BEGIN markers', `${BEGIN_MARKER}\n${BEGIN_MARKER}\nx\n${END_MARKER}\n`],
    ['two END markers', `${BEGIN_MARKER}\nx\n${END_MARKER}\n${END_MARKER}\n`],
    ['END before BEGIN', `${END_MARKER}\nx\n${BEGIN_MARKER}\n`],
  ])('refuses a document with %s', (_name, content) => {
    expect(() => findRegion(content)).toThrow(ReferenceRegionError);
  });

  it('names the first differing line', () => {
    expect(firstDifference('a\nb\nc', 'a\nB\nc')).toContain('line 2');
    expect(firstDifference('a', 'a\nmore')).toContain('<end>');
    expect(firstDifference('same', 'same')).toBe('no difference');
  });
});

describe('blocks-reference CLI', () => {
  it('--check fails on drift and leaves the file untouched; a write fixes it', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const file = tempDoc(doc('stale reference\n'));
    expect(run(['--check'], file)).toBe(1);
    expect(readFileSync(file, 'utf8')).toBe(doc('stale reference\n'));
    expect(run([], file)).toBe(0);
    expect(readFileSync(file, 'utf8')).toBe(doc(renderBlockCatalogMarkdown()));
    expect(run(['--check'], file)).toBe(0);
  });

  it('fails clearly on broken markers and on unknown arguments', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(run(['--check'], tempDoc('no markers here\n'))).toBe(1);
    expect(errors.mock.calls.flat().join(' ')).toMatch(/exactly one BEGIN and one END marker/);
    expect(run(['--write'], tempDoc(doc('x\n')))).toBe(2);
  });

  it('the committed docs/BLOCKS.md is current', () => {
    expect(regionIsCurrent(readFileSync(BLOCKS_DOC, 'utf8'), renderBlockCatalogMarkdown())).toBe(
      true
    );
  });
});
