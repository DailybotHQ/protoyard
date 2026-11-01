// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type DocDocument, DocDocumentSchema } from '@protoyard/pages';
import { describe, expect, it } from 'vitest';
import { exportDoc } from '../src/doc/doc-export.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const doc = DocDocumentSchema.parse(
  (
    JSON.parse(readFileSync(resolve(ROOT, 'templates/doc/blueprint.json'), 'utf8')) as {
      doc?: unknown;
    }
  ).doc
) as DocDocument;

async function write(format: 'docx' | 'pdf' | 'markdown') {
  let blob: Blob | null = null;
  const outcome = await exportDoc(doc, format, {
    download: false,
    onBlob: (value) => {
      blob = value;
    },
  });
  if (!blob) throw new Error('no blob');
  return { outcome, bytes: new Uint8Array(await (blob as Blob).arrayBuffer()) };
}

const ascii = (bytes: Uint8Array, length: number) =>
  String.fromCharCode(...bytes.subarray(0, length));

describe('exportDoc (Texuli writers)', () => {
  it('writes a DOCX package', async () => {
    const { outcome, bytes } = await write('docx');
    expect(ascii(bytes, 2)).toBe('PK');
    expect(outcome.filename).toMatch(/\.docx$/);
    expect(outcome.size).toBe(bytes.byteLength);
    expect(outcome.size).toBeGreaterThan(1_000);
  });

  it('writes a PDF with its page count', async () => {
    const { outcome, bytes } = await write('pdf');
    expect(ascii(bytes, 5)).toBe('%PDF-');
    expect(outcome.filename).toMatch(/\.pdf$/);
    expect(outcome.pageCount).toBeGreaterThanOrEqual(1);
  });

  it('writes Markdown with the headings, tables as text and form titles', async () => {
    const { outcome, bytes } = await write('markdown');
    const text = new TextDecoder().decode(bytes);
    expect(outcome.filename).toMatch(/\.md$/);
    const headings = doc.blocks.filter((block) => block.type === 'heading');
    for (const heading of headings) {
      if (heading.type === 'heading') expect(text).toContain(heading.text);
    }
    expect(text).toContain('Tickets by channel, Q3 2026 (fictional)');
    expect(text).toContain('Reader feedback');
    expect(text).not.toMatch(/<script|javascript:/i);
  });

  it('explains, once, that interactive blocks are written as their titles', async () => {
    const { outcome } = await write('docx');
    expect(outcome.notes).toEqual([
      'Interactive blocks (charts without data, forms, embedded apps) are written as their titles.',
    ]);
  });
});
