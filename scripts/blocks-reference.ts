/**
 * Block reference generator (`npx tsx scripts/blocks-reference.ts [--check]`).
 *
 * docs/BLOCKS.md has two owners. The region between the BEGIN and END markers
 * is generated from `BLOCK_CATALOG` by `renderBlockCatalogMarkdown()` in
 * `@protoyard/blocks/catalog` (props from the zod schemas, limits, use-when,
 * don't-use-when, accessibility and a minimal example per type); everything
 * outside it is hand-written narrative. This script rewrites only the region
 * and leaves the narrative byte-for-byte untouched.
 *
 *   npx tsx scripts/blocks-reference.ts          rewrite the region if it drifted
 *   npx tsx scripts/blocks-reference.ts --check  exit 1 when it drifted (CI, gates)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderBlockCatalogMarkdown } from '../packages/blocks/src/catalog/index.ts';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const BLOCKS_DOC = resolve(ROOT, 'docs/BLOCKS.md');

export const BEGIN_MARKER =
  '<!-- BEGIN GENERATED BLOCK CATALOG: keep this region in sync with renderBlockCatalogMarkdown(). -->';
export const END_MARKER = '<!-- END GENERATED BLOCK CATALOG -->';

export class ReferenceRegionError extends Error {}

/** The start and end offsets of the generated content (between the marker lines). */
export function findRegion(document: string): { start: number; end: number } {
  const begins = document.split(BEGIN_MARKER).length - 1;
  const ends = document.split(END_MARKER).length - 1;
  if (begins !== 1 || ends !== 1) {
    throw new ReferenceRegionError(
      `docs/BLOCKS.md needs exactly one BEGIN and one END marker (found ${begins} and ${ends}).`
    );
  }
  const beginAt = document.indexOf(BEGIN_MARKER);
  const end = document.indexOf(END_MARKER);
  const start = document.indexOf('\n', beginAt) + 1;
  if (start === 0 || end < start) {
    throw new ReferenceRegionError('The END marker must come after the BEGIN marker line.');
  }
  return { start, end };
}

/** The document with its generated region replaced; text outside the markers is kept as is. */
export function replaceRegion(document: string, generated: string): string {
  const { start, end } = findRegion(document);
  const body = generated.endsWith('\n') ? generated : `${generated}\n`;
  return `${document.slice(0, start)}${body}${document.slice(end)}`;
}

/** True when the region already equals the generated reference. */
export function regionIsCurrent(document: string, generated: string): boolean {
  return replaceRegion(document, generated) === document;
}

/** The first line where two texts differ, for a readable drift message. */
export function firstDifference(current: string, expected: string): string {
  const a = current.split('\n');
  const b = expected.split('\n');
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i] !== b[i]) {
      return `line ${i + 1}:\n  docs:     ${JSON.stringify(a[i] ?? '<end>')}\n  catalog:  ${JSON.stringify(b[i] ?? '<end>')}`;
    }
  }
  return 'no difference';
}

export function run(args: readonly string[], file = BLOCKS_DOC): number {
  const check = args.includes('--check');
  const unknown = args.filter((arg) => arg !== '--check');
  if (unknown.length > 0) {
    console.error(
      `Unknown argument: ${unknown.join(' ')}\nUsage: npx tsx scripts/blocks-reference.ts [--check]`
    );
    return 2;
  }
  const shown = relative(ROOT, file) || file;
  const document = readFileSync(file, 'utf8');
  const generated = renderBlockCatalogMarkdown();
  let next: string;
  try {
    next = replaceRegion(document, generated);
  } catch (error) {
    console.error(`✗ ${(error as Error).message}`);
    return 1;
  }
  if (next === document) {
    console.log(`✓ ${shown}: the block reference matches BLOCK_CATALOG.`);
    return 0;
  }
  if (check) {
    const { start, end } = findRegion(document);
    console.error(
      `✗ ${shown}: the generated block reference drifted from BLOCK_CATALOG (${firstDifference(
        document.slice(start, end),
        generated
      )}).\n  Run: npx tsx scripts/blocks-reference.ts`
    );
    return 1;
  }
  writeFileSync(file, next);
  console.log(
    `✓ ${shown}: rewrote the generated block reference (narrative outside the markers kept).`
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = run(process.argv.slice(2));
}
