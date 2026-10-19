// @vitest-environment node
/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../src', import.meta.url));

function svelteFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return svelteFiles(path);
    return entry.name.endsWith('.svelte') ? [path] : [];
  });
}

/**
 * The shell hosts @protoyard/ai-ui components that follow the theme tokens. A
 * hard-coded light color (`bg-white`, `text-[#…]`) does not follow dark mode, so
 * token-colored text ends up on a light surface and fails AA contrast.
 */
describe('nova-assistant-demo theme tokens', () => {
  it('uses theme tokens instead of hard-coded color utilities', () => {
    const offenders = svelteFiles(SRC).flatMap((file) =>
      [
        ...readFileSync(file, 'utf8').matchAll(
          /\b(?:bg|text|border|ring|accent|fill|stroke)-(?:\[#[0-9a-fA-F]{3,8}\]|white|black(?!\/))/g
        ),
      ].map((match) => `${file.slice(SRC.length + 1)}: ${match[0]}`)
    );
    expect(offenders).toEqual([]);
  });
});
