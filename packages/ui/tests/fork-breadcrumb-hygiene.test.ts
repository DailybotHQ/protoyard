// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));

describe('fork engineering breadcrumbs', () => {
  it('does not keep fork task labels in the shared cn helper', () => {
    const source = readFileSync(join(ROOT, 'packages/ui/src/lib/cn.ts'), 'utf8');
    // Any FORK_<NAME> task label, without naming a product fork in upstream source.
    expect(source).not.toMatch(/FORK_[A-Z]+/);
    expect(source).toMatch(/shadow-soft/);
  });

  it('does not describe the SaaS scenario helper rng as "forked"', () => {
    const source = readFileSync(join(ROOT, 'packages/saas/src/scenarios.ts'), 'utf8');
    expect(source).not.toMatch(/forked rng/i);
    expect(source).toMatch(/child \(seeded\) rng|seeded\) rng/);
  });
});
