import { checkAdoption, RULES, scanSource } from '@protoyard/cli/adoption';
import { describe, expect, it } from 'vitest';

describe('@protoyard/cli/adoption (Corag UG-14)', () => {
  it('scans a source string with the same rules as `protoyard check texuli`', () => {
    const found = scanSource('a.svelte', '<div style="padding: var(--py-safe-top)"></div>');
    expect(found.map((v) => v.rule)).toEqual(['py-token']);
    expect(RULES).toContain('raw-control');
    expect(typeof checkAdoption).toBe('function');
  });
});
