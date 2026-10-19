// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const BIN = fileURLToPath(new URL('../src/bin.ts', import.meta.url));

describe('protoyard bin', () => {
  // A slow pipe reader used to receive only the first 64 KB: the process exited before stdout drained.
  it('flushes a large --json envelope to a slow pipe before exiting', { timeout: 120_000 }, () => {
    const script = `node --import tsx "${BIN}" --root "${ROOT}" list --kind all --json 2>/dev/null | (sleep 2; cat)`;
    const text = execFileSync('bash', ['-c', script], {
      cwd: ROOT,
      maxBuffer: 16 * 1024 * 1024,
    }).toString('utf8');
    expect(text.length).toBeGreaterThan(65_536);
    expect(() => JSON.parse(text)).not.toThrow();
  });
});
