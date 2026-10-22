import { existsSync, readFileSync } from 'node:fs';
import { copyFile, mkdir, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { type AnyBlueprint, type Blueprint, loadUntrustedDocument } from '@protoyard/blueprint';
import type { PrototypeDefinition, PrototypeRuntime } from '@protoyard/core';
import { mountPrototype } from '@protoyard/renderer-svelte';
import { createPrototypeRuntime } from '@protoyard/runtime';
import { configure } from '@testing-library/svelte';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import type { Component } from 'svelte';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import {
  emitContentKindPrototype,
  kindTemplateFilesRemoved,
  TEMPLATE_FILES_REMOVED,
} from '../../cli/src/lib/codegen/emit.ts';
import type { BootedPlayer } from '../src/boot.ts';
import { bootKind } from '../src/boot-kind.ts';

configure({ asyncUtilTimeout: 15_000 });

/**
 * Level-1 / level-2 parity for content kinds (ADR-036, ADR-038): one deck,
 * page and doc go through the player's `bootKind` path and through a
 * prototype built exactly as `protoyard generate` builds it (the kind
 * template copied, then the real `emitContentKindPrototype` files on top,
 * with the template's own dependencies linked). Both must mount the same
 * renderer from the same runtime definition: the same slide or section ids in
 * the same order, the same stores, scenarios, personas' policy and generator
 * version, and the same theme. Any divergence fails here.
 */

const ROOT = resolve(import.meta.dirname, '../../..');
const FIXTURES = join(ROOT, 'packages/blueprint/tests/fixtures/kinds');
/** Same depth as prototypes/<slug>, so the template's `../../tsconfig.base.json` resolves. */
const workDir = (kind: string) => join(ROOT, 'tmp', `kinds-parity-${kind}`);

type Kind = 'deck' | 'page' | 'doc';

/** Each fixture, enriched so ordering and theming are meaningful. */
function fixtureJson(kind: Kind): Record<string, unknown> {
  const file = {
    deck: 'intro.deck.json',
    page: 'landing.page.json',
    doc: 'quarterly-report.doc.json',
  }[kind];
  // biome-ignore lint/suspicious/noExplicitAny: fixtures are edited freely in tests.
  const value = JSON.parse(readFileSync(join(FIXTURES, file), 'utf8')) as any;
  value.brand = { seed: '#0f766e' };
  if (kind === 'deck') {
    for (const id of ['middle', 'closing']) {
      value.deck.slides.push({
        id,
        layout: 'free',
        title: id,
        blocks: [{ type: 'heading', text: id }],
      });
      value.deck.outline.sections[0].slideIds.push(id);
    }
  }
  return value;
}

/**
 * `copyTemplate` from the CLI's `new` command, with its skip rules (that module
 * reads `import.meta.url` as a file URL at load, which happy-dom does not give).
 */
const SKIP = new Set([
  '.git',
  '.env',
  '.envrc',
  '.npmrc',
  'node_modules',
  'dist',
  '.astro',
  'artifacts',
  '.protoyard',
  '.DS_Store',
  '.turbo',
  '.vite',
  'coverage',
]);
async function copyTemplate(source: string, destination: string): Promise<void> {
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (SKIP.has(entry.name) || /^\.env\.(?!example$)/.test(entry.name)) continue;
    if (entry.isDirectory())
      await copyTemplate(join(source, entry.name), join(destination, entry.name));
    else if (entry.isFile())
      await copyFile(join(source, entry.name), join(destination, entry.name));
  }
}

/** Builds prototypes/<slug> the way `generate` does, in the git-ignored tmp/. */
async function generated(kind: Kind, json: Record<string, unknown>, blueprint: AnyBlueprint) {
  const dest = workDir(kind);
  await rm(dest, { recursive: true, force: true });
  const template = join(ROOT, 'templates', kind);
  await copyTemplate(template, dest);
  for (const path of [...TEMPLATE_FILES_REMOVED, ...kindTemplateFilesRemoved(kind)]) {
    await rm(join(dest, path), { force: true });
  }
  await rm(join(dest, 'tests'), { recursive: true, force: true });
  const text = `${JSON.stringify(json, null, 2)}\n`;
  for (const file of emitContentKindPrototype(
    blueprint as Exclude<AnyBlueprint, Blueprint>,
    text
  )) {
    await mkdir(join(dest, file.path, '..'), { recursive: true });
    await writeFile(join(dest, file.path), file.content);
  }
  // The generated prototype resolves the same packages its template does.
  if (!existsSync(join(dest, 'node_modules'))) {
    await symlink(join(template, 'node_modules'), join(dest, 'node_modules'), 'dir');
  }
  const prototype = (await import(/* @vite-ignore */ join(dest, 'src/prototype.ts'))) as {
    definition: PrototypeDefinition;
  };
  const App = (
    (await import(/* @vite-ignore */ join(dest, 'src/App.svelte'))) as { default: Component }
  ).default;
  return { definition: prototype.definition, App };
}

const opened: { destroy(): Promise<void> }[] = [];
afterEach(async () => {
  for (const item of opened.splice(0)) await item.destroy();
  document.body.replaceChildren();
});
afterAll(async () => {
  for (const kind of ['deck', 'page', 'doc'])
    await rm(workDir(kind), { recursive: true, force: true });
});

const runtimeFactory = () => {
  const indexedDB = new IDBFactory();
  return (definition: PrototypeDefinition, options: Parameters<typeof createPrototypeRuntime>[1]) =>
    createPrototypeRuntime(definition, {
      ...options,
      indexedDB,
      IDBKeyRange,
      sleep: async () => {},
    });
};

/** What a renderer shows, in document order: the active slide, page sections, doc headings. */
function shown(root: Element, kind: Kind): string[] {
  if (kind === 'deck') {
    // DeckCanvas keeps a window around the active slide; only one is not hidden.
    return [
      ...root.querySelectorAll('[data-canvas-slide][aria-hidden="false"] [data-py-deck-slide]'),
    ].map((n) => n.getAttribute('data-py-deck-slide') ?? '');
  }
  if (kind === 'page') {
    return [...root.querySelectorAll('[data-py-page-section]')].map(
      (n) => n.getAttribute('data-py-page-section') ?? ''
    );
  }
  return [
    ...root.querySelectorAll('[data-py-doc-host] h1, [data-py-doc-host] h2, [data-py-doc-host] h3'),
  ].map((n) => n.textContent?.trim() ?? '');
}

/**
 * The content in order. A deck is walked with the keyboard (ArrowRight also
 * advances build steps, so the active id is recorded each time it changes);
 * pages and docs render everything at once.
 */
async function content(root: Element, kind: Kind, want: readonly string[]): Promise<string[]> {
  if (kind !== 'deck') {
    await vi.waitFor(() => expect(shown(root, kind)).toEqual(want), { timeout: 15_000 });
    return shown(root, kind);
  }
  const app = root.querySelector<HTMLElement>(ROOT_MARK.deck);
  if (!app) throw new Error('No deck app.');
  await vi.waitFor(() => expect(shown(root, kind)).toHaveLength(1), { timeout: 15_000 });
  const seen = [shown(root, kind)[0] ?? ''];
  for (let press = 0; press < want.length * 8 && seen.length < want.length; press += 1) {
    app.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await new Promise((done) => setTimeout(done, 10));
    const active = shown(root, kind)[0] ?? '';
    if (active !== seen.at(-1)) seen.push(active);
  }
  return seen;
}

/**
 * What the blueprint says each renderer must show once every lazy block has
 * loaded: slide ids, section ids, or the doc title and its heading blocks.
 */
function expected(kind: Kind, json: Record<string, unknown>): string[] {
  // biome-ignore lint/suspicious/noExplicitAny: fixtures are edited freely in tests.
  const value = json as any;
  if (kind === 'deck') return value.deck.slides.map((s: { id: string }) => s.id);
  if (kind === 'page') return value.page.sections.map((s: { id: string }) => s.id);
  return [
    value.doc.title ?? value.name,
    ...value.doc.blocks
      .filter((b: { type: string }) => b.type === 'heading')
      .map((b: { text: string }) => b.text),
  ];
}

const ROOT_MARK: Record<Kind, string> = {
  deck: '[data-py-deck-app]',
  page: '[data-py-page-app]',
  doc: '[data-py-doc-app]',
};

/** The parts of a definition both levels must share (namespaces and slugs differ by design). */
function contract(definition: PrototypeDefinition) {
  return {
    stores: definition.database.versions.map((v) => ({ version: v.version, stores: v.stores })),
    scenarios: definition.scenarios.map((s) => s.id),
    defaultScenario: definition.manifest.defaultScenario,
    roles: definition.policy?.roles,
    generatorVersion: definition.generatorVersion,
    defaultTheme: definition.manifest.defaultTheme,
    themes: (definition.themes ?? []).map((t) => t.id),
  };
}

describe.each(['deck', 'page', 'doc'] as const)(
  '%s: level 1 (player) and level 2 (generated) parity',
  (kind) => {
    it('mounts the same renderer from the same runtime definition, with the same content in the same order', async () => {
      const json = fixtureJson(kind);
      const loaded = await loadUntrustedDocument(json);
      if (!loaded.success) throw new Error(JSON.stringify(loaded.issues));
      const blueprint = loaded.blueprint;

      // Level 1: the player's kind boot.
      const playerTarget = document.body.appendChild(document.createElement('div'));
      const player: BootedPlayer = await bootKind({
        blueprint,
        target: playerTarget,
        search: '',
        indexFactory: new IDBFactory(),
        createRuntime: runtimeFactory(),
      });
      opened.push(player);
      expect(player.error).toBeNull();
      await vi.waitFor(() => expect(playerTarget.querySelector(ROOT_MARK[kind])).not.toBeNull());
      const want = expected(kind, json);
      const level1Content = await content(playerTarget, kind, want);
      // A deck's location lives in the URL hash; start level 2 from the first slide.
      history.replaceState(null, '', location.pathname);

      // Level 2: the generated prototype's own App.svelte and prototype.ts.
      const level2 = await generated(kind, json, blueprint);
      const appTarget = document.body.appendChild(document.createElement('div'));
      const mounted = await mountPrototype({
        definition: level2.definition,
        App: level2.App,
        target: appTarget,
        search: '',
        createRuntime: runtimeFactory(),
      });
      opened.push(mounted);
      expect(mounted.error).toBeNull();
      await vi.waitFor(() => expect(appTarget.querySelector(ROOT_MARK[kind])).not.toBeNull());
      const level2Content = await content(appTarget, kind, want);

      // Same renderer, same content, same order.
      expect(level1Content).toEqual(want);
      expect(level2Content).toEqual(level1Content);
      if (kind === 'deck') expect(level2Content).toEqual(['opening', 'middle', 'closing']);

      // Same runtime definition (stores, scenarios, policy, generator, theme).
      const playerDefinition = (player.runtime as PrototypeRuntime).definition;
      expect(contract(level2.definition)).toEqual(contract(playerDefinition));
      expect(contract(playerDefinition).themes).toHaveLength(1);

      // Same persisted stores and active theme in the running runtimes.
      const level1Runtime = player.runtime as PrototypeRuntime;
      const level2Runtime = mounted.runtime as PrototypeRuntime;
      expect(level2Runtime.data.tables()).toEqual(level1Runtime.data.tables());
      expect(level2Runtime.theme.appearance().theme).toEqual(
        level1Runtime.theme.appearance().theme
      );
      expect(level2Runtime.session.principal()?.persona.id).toBe(
        level1Runtime.session.principal()?.persona.id
      );
    }, 60_000);
  }
);
