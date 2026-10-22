import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as lucide from '@lucide/svelte';
import { BLOCK_ICONS, IconNameSchema, isBlockIcon, safeParseBlock } from '@protoyard/blocks';
import { cleanup, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
// blocks-ui does not depend on the blueprint; the test reads its source to keep the lists in sync.
import { SCREEN_NAV_ICONS } from '../../blueprint/src/schema.ts';
import { BLOCK_ICON_COMPONENTS } from '../src/lib/icons.ts';

afterEach(cleanup);

/** `share-2` → `Share2`, the Lucide export name. */
const pascal = (id: string) =>
  id
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

describe('block icons', () => {
  it('is a sorted, unique, kebab-case allow-list of at most 96 names', () => {
    expect(BLOCK_ICONS.length).toBeLessThanOrEqual(96);
    expect(new Set(BLOCK_ICONS).size).toBe(BLOCK_ICONS.length);
    expect([...BLOCK_ICONS]).toEqual([...BLOCK_ICONS].sort());
    for (const id of BLOCK_ICONS) expect(id).toMatch(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
  });

  it('maps every BLOCK_ICONS id to its Lucide component, and nothing else', () => {
    expect(Object.keys(BLOCK_ICON_COMPONENTS).sort()).toEqual([...BLOCK_ICONS].sort());
    const exports = lucide as unknown as Record<string, unknown>;
    for (const id of BLOCK_ICONS) {
      const expected = exports[pascal(id)];
      expect(expected, `@lucide/svelte has no ${pascal(id)} for "${id}"`).toBeTypeOf('function');
      expect(BLOCK_ICON_COMPONENTS[id], id).toBe(expected);
    }
  });

  it('includes every screen navigation icon, so apps and content share one vocabulary', () => {
    const missing = SCREEN_NAV_ICONS.filter(
      (id) => !(BLOCK_ICONS as readonly string[]).includes(id)
    );
    expect(missing).toEqual([]);
  });

  it('narrows the block schema to the allow-list', () => {
    for (const id of BLOCK_ICONS) expect(IconNameSchema.safeParse(id).success, id).toBe(true);
    for (const value of [
      'skull',
      'Rocket',
      'rocket ',
      'share2',
      '<svg onload=x>',
      '',
      'constructor',
    ]) {
      expect(IconNameSchema.safeParse(value).success, value).toBe(false);
      expect(isBlockIcon(value)).toBe(false);
    }
    expect(isBlockIcon('rocket')).toBe(true);
    const result = safeParseBlock({ type: 'icon', icon: 'skull', label: 'Danger' });
    expect(result.issues[0]?.jsonPath).toBe('$["icon"]');
  });

  it('renders an icon as an SVG', () => {
    const { container } = render(BLOCK_ICON_COMPONENTS.rocket, { 'aria-hidden': 'true' });
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });

  it('imports icons by name only, never the whole icon set', () => {
    const source = readFileSync(join(import.meta.dirname, '..', 'src', 'lib', 'icons.ts'), 'utf8');
    expect(source).not.toMatch(/import\s+\*\s+as|\bicons\b\s*[,}]|import\s*\(/);
    const named = /import\s*\{([^}]*)\}\s*from\s*'@lucide\/svelte'/.exec(source)?.[1] ?? '';
    const names = named
      .split(',')
      .map((name) => name.trim().split(/\s+as\s+/)[0] as string)
      .filter(Boolean);
    expect(names.sort()).toEqual(BLOCK_ICONS.map(pascal).sort());
  });
});
