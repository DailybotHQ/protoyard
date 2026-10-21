// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeQuickAtomic } from '../src/lib/quick/atomic-write.ts';

const folders: string[] = [];

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

describe('quick atomic writes', () => {
  it('does not overwrite a colliding temporary file', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'protoyard-quick-atomic-'));
    folders.push(folder);
    const destination = join(folder, 'result.json');
    const collision = `${destination}.fixed-id.tmp`;
    writeFileSync(collision, 'keep this file');

    await expect(
      writeQuickAtomic(destination, 'replacement', () => 'fixed-id')
    ).rejects.toMatchObject({
      code: 'EEXIST',
    });
    expect(readFileSync(collision, 'utf8')).toBe('keep this file');
  });
});
