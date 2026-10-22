/**
 * AC-authoring-readme-links: every relative markdown link in the blueprint
 * package README resolves to an existing file or directory.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const README = resolve(dirname(fileURLToPath(import.meta.url)), '../README.md');
const README_DIR = dirname(README);

/** Markdown links and images: [text](target) or ![alt](target). */
const MD_LINK = /!\[[^\]]*]\(([^)]+)\)|\[[^\]]*]\(([^)]+)\)/g;

function linkTargets(markdown: string): string[] {
  const targets: string[] = [];
  for (const match of markdown.matchAll(MD_LINK)) {
    const raw = (match[1] ?? match[2] ?? '').trim();
    if (!raw) continue;
    // Strip optional title: path "title"
    const pathOnly = raw.replace(/\s+".*"$/, '').trim();
    targets.push(pathOnly);
  }
  return targets;
}

function isExternal(target: string): boolean {
  return (
    /^(https?:|mailto:|data:)/i.test(target) ||
    target.startsWith('#') ||
    target.startsWith('//')
  );
}

function resolveLocal(target: string): string {
  const hash = target.indexOf('#');
  const pathPart = hash >= 0 ? target.slice(0, hash) : target;
  if (!pathPart) return README; // pure fragment on this file
  return normalize(resolve(README_DIR, pathPart));
}

describe('packages/blueprint/README.md', () => {
  it('exists and documents kind detection and deck authoring', () => {
    const text = readFileSync(README, 'utf8');
    expect(text.length).toBeGreaterThan(1000);
    expect(text).toMatch(/## Agent authoring sequence/);
    expect(text).toMatch(/### Kind detection/);
    expect(text).toMatch(/### Deck outline templates/);
    expect(text).toMatch(/### Deck layout selection/);
    expect(text).toMatch(/### Authoring diagnostics/);
    expect(text).toMatch(/## Deck structural lint/);
    expect(text).toMatch(/draft scaffolding/i);
    expect(text).toMatch(/validateBlueprintForAuthoring/);
    expect(text).toMatch(/lintDeckStructure/);
    expect(text).toMatch(/selectDeckLayouts/);
    expect(text).toMatch(/detectBriefKind/);
  });

  it('resolves every relative markdown link to an existing path', () => {
    const text = readFileSync(README, 'utf8');
    const targets = linkTargets(text);
    expect(targets.length).toBeGreaterThan(5);

    const missing: string[] = [];
    for (const target of targets) {
      if (isExternal(target)) continue;
      const absolute = resolveLocal(target);
      // Stay inside the monorepo (no escape via .. beyond repo root).
      const repoRoot = resolve(README_DIR, '../..');
      if (!absolute.startsWith(repoRoot)) {
        missing.push(`${target} → escapes repo (${absolute})`);
        continue;
      }
      if (!existsSync(absolute)) {
        missing.push(`${target} → ${absolute}`);
        continue;
      }
      // Directories are fine (e.g. blueprints/).
      try {
        statSync(absolute);
      } catch {
        missing.push(`${target} → unreadable`);
      }
    }

    expect(missing, missing.join('\n')).toEqual([]);
  });
});
