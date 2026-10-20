// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { deriveAppModel, parseBlueprint } from '../../src/index.ts';

const ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
const QUICK_DIR = resolve(ROOT, 'blueprints/quick');
const CATALOG_PATH = resolve(QUICK_DIR, 'README.md');
const CATALOG = readFileSync(CATALOG_PATH, 'utf8');
const EXAMPLE_FILES = readdirSync(QUICK_DIR)
  .filter((file) => file.endsWith('.json'))
  .sort();

function tableCells(line: string): string[] {
  return line
    .split('|')
    .slice(1, -1)
    .map((cell) => cell.trim());
}

function bytesLabel(bytes: number): string {
  return `${bytes.toLocaleString('en-US')} B JSON`;
}

describe('quick blueprint catalog', () => {
  it('links every quick blueprint once and has no stale example links', () => {
    const rows = CATALOG.split('\n').filter((line) => line.startsWith('| [Quick '));
    const rowLinks = rows.map((line) => line.match(/\]\((\.\/[^)]+\.json)\)/)?.[1]);
    const markdownLinks = [...CATALOG.matchAll(/\]\((\.\/[^)]+\.json)\)/g)].map(
      (match) => match[1]
    );
    const expectedLinks = EXAMPLE_FILES.map((file) => `./${file}`).sort();

    expect(rowLinks.every(Boolean)).toBe(true);
    expect(markdownLinks.sort()).toEqual(expectedLinks);
    expect(rowLinks.sort()).toEqual(expectedLinks);
    for (const link of markdownLinks) {
      if (!link) continue;
      const resolved = resolve(QUICK_DIR, link);
      expect(relative(QUICK_DIR, resolved).startsWith('..')).toBe(false);
      expect(() => readFileSync(resolved, 'utf8')).not.toThrow();
    }
  });

  it('keeps archetype, kit, first-run scope and exercise metadata current and compact', () => {
    const rows = CATALOG.split('\n').filter((line) => line.startsWith('| [Quick '));
    expect(rows).toHaveLength(EXAMPLE_FILES.length);

    for (const row of rows) {
      const [title = '', archetypeId = '', kits = '', scope = '', exercise = ''] = tableCells(row);
      const link = title.match(/\]\((\.\/[^)]+\.json)\)/)?.[1];
      expect(link, row).toBeDefined();
      if (!link) continue;

      const file = resolve(QUICK_DIR, link);
      const text = readFileSync(file, 'utf8');
      const blueprint = parseBlueprint(JSON.parse(text));
      const archetype = blueprint.archetype;
      expect(archetype, file).toBeDefined();
      if (!archetype) continue;

      const actualKits = archetype.kits.map((kit) => `\`${kit}\``).join(', ');
      const routeCount = deriveAppModel(blueprint).routes.length;
      const bytes = statSync(file).size;
      expect(archetype.id, file).toBe(archetypeId);
      expect(kits, file).toBe(actualKits);
      expect(scope, file).toBe(
        `${blueprint.entities.length} entities · ${routeCount} routes · ${bytesLabel(bytes)}`
      );
      expect(exercise.trim().length, file).toBeGreaterThan(20);
      const validationTasks = blueprint.validation?.tasks ?? [];
      if (validationTasks.length > 0) {
        for (const task of validationTasks) expect(exercise, file).toContain(task.id);
      } else {
        const archetypePath = archetype.screens[0]?.path;
        expect(archetypePath, file).toBeDefined();
        if (!archetypePath) continue;
        expect(exercise, file).toContain(archetypePath);
      }

      expect(bytes, file).toBeLessThanOrEqual(5_000);
      expect(blueprint.entities.length, file).toBeLessThanOrEqual(3);
      expect(blueprint.screens?.length ?? 0, file).toBeLessThanOrEqual(3);
      expect(routeCount, file).toBeLessThanOrEqual(8);
      expect(archetype.kits.length, file).toBeGreaterThan(0);
    }
  });
});
