// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkInvocation, cliTree, extractInvocations } from '../../../scripts/check-skill-cli.ts';
import { DECK_LAYOUT_IDS } from '../../decks/src/layouts/catalog.ts';
import { createProgram } from '../src/program.ts';

/**
 * The skill's deck path: the router (skills/protoyard/SKILL.md) sends deck
 * requests to skills/protoyard/references/decks.md, which keeps agents on the
 * JSON blueprint workflow: catalog layouts chosen by their use-when metadata,
 * validation and a visual check, level 2 only for custom Svelte behavior, and
 * never Reveal.js Markdown or HTML. The test file lives here, not in
 * skills/protoyard, because every file there ships in the installed skill.
 */

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const ROUTER = join('skills', 'protoyard', 'SKILL.md');
const DECKS = join('skills', 'protoyard', 'references', 'decks.md');
const read = (path: string) => readFileSync(join(REPO, path), 'utf8');
const tree = cliTree(createProgram({ setExitCode: () => {} }));

/** The router's "Route by intent" rows: the intent text and the linked file. */
function routes(): { intent: string; target: string }[] {
  const table = read(ROUTER).split('## Route by intent')[1]?.split('\n## ')[0] ?? '';
  return [...table.matchAll(/^\| ([^|]+) \| \[`[^`]+`\]\(([^)]+)\) \|$/gm)].map(
    ([, intent, target]) => ({ intent: (intent ?? '').trim(), target: target ?? '' })
  );
}

/** The route an agent takes for `request`: the row sharing the most words with it. */
function route(request: string): string | undefined {
  const words = new Set(request.toLowerCase().match(/[a-z]+/g) ?? []);
  let best: { target: string; score: number } | undefined;
  for (const { intent, target } of routes()) {
    const score = (intent.toLowerCase().match(/[a-z]+/g) ?? []).filter(
      (word) => word.length > 3 && words.has(word)
    ).length;
    if (score > (best?.score ?? 0)) best = { target, score };
  }
  return best?.target;
}

/** `quick`, `blueprint validate`… named by a file's real invocations, with their flags. */
function commands(path: string): string[] {
  return extractInvocations(read(path), path).map((invocation) => invocation.args.join(' '));
}

describe('the skill routes deck requests to the deck path', () => {
  it.each([
    'Make a slide deck for our quarterly review',
    'I need a presentation about the new onboarding flow',
    'Build a pitch for a fictional bakery app',
    'Put together a keynote for the team offsite',
  ])('"%s" → references/decks.md', (request) => {
    expect(route(request)).toBe('references/decks.md');
  });

  it.each([
    ['Turn this brief into a full prototype', 'new/SKILL.md'],
    ['Export or publish my prototype', 'ship/SKILL.md'],
    ['Explore an idea quickly with variants', 'quick/SKILL.md'],
  ])('"%s" still routes elsewhere (%s)', (request, target) => {
    expect(route(request)).toBe(target);
  });

  it('states the deck rule in the router and links a reference that exists', () => {
    const router = read(ROUTER);
    expect(router).toContain('](references/decks.md)');
    expect(existsSync(join(REPO, DECKS))).toBe(true);
    expect(router).toMatch(/A deck is a `kind: "deck"` JSON blueprint/);
    expect(router).toMatch(/Never write Reveal\.js Markdown or HTML for a\s+deck/);
  });

  it('is described in docs/SKILL.md with a resolving link', () => {
    const guide = read(join('docs', 'SKILL.md'));
    expect(guide).toContain('## Make a slide deck');
    expect(guide).toContain('](../skills/protoyard/references/decks.md)');
  });
});

describe('the deck reference', () => {
  const text = read(DECKS);

  it('uses only commands and flags the real CLI has', () => {
    const invocations = extractInvocations(text, DECKS);
    expect(invocations.length).toBeGreaterThan(10);
    expect(invocations.flatMap((invocation) => checkInvocation(tree, invocation))).toEqual([]);
  });

  it('starts from JSON blueprints: quick --kind deck, blueprint validate, quick --blueprint', () => {
    const named = commands(DECKS);
    expect(named.some((args) => args.startsWith('quick ') && args.includes('--kind deck'))).toBe(
      true
    );
    expect(named.some((args) => args.startsWith('blueprint validate'))).toBe(true);
    expect(named.some((args) => args.startsWith('quick --blueprint'))).toBe(true);
    expect(text).toContain('kind: "deck"');
  });

  it('lists every catalog layout with its use-when guidance', () => {
    const layouts = text.split('## Choose layouts')[1]?.split('\n## ')[0] ?? '';
    for (const id of DECK_LAYOUT_IDS) expect(layouts, id).toContain(`\`${id}\``);
    for (const word of ['useWhen', 'dontUseWhen', 'pacing', 'describeLayouts()']) {
      expect(layouts, word).toContain(word);
    }
  });

  it('requires validation and a visual check, and names the checkout checks that exist', () => {
    const named = commands(DECKS);
    expect(named.some((args) => args.startsWith('quick shot'))).toBe(true);
    const checks = text.split('## Validate and check')[1]?.split('\n## ')[0] ?? '';
    expect(checks).toMatch(/1\. \*\*Validate\*\*/);
    expect(checks).toContain('lintDeckStructure');
    expect(checks).toContain('scripts/sweep-deck.ts');
    expect(existsSync(join(REPO, 'scripts', 'sweep-deck.ts'))).toBe(true);
  });

  it('offers level 2 only for custom Svelte behavior, through generate', () => {
    const level2 = text.split('## When to go to level 2')[1]?.split('\n## ')[0] ?? '';
    expect(level2).toContain('custom Svelte');
    expect(commands(DECKS).some((args) => args.startsWith('generate '))).toBe(true);
    // quick promote refuses decks; the reference must not send decks through it.
    expect(commands(DECKS).some((args) => args.startsWith('quick promote'))).toBe(true);
    expect(text).toMatch(/`protoyard quick promote` turns only app explorations/);
  });

  it('never instructs Reveal.js Markdown, raw HTML or unsafe rendering', () => {
    // No HTML or Markdown slide fences, no slide separators in code.
    expect(text).not.toMatch(/```(?:html|markdown|md)\b/);
    for (const block of text.matchAll(/```[a-z]*\n([\s\S]*?)```/g)) {
      expect(block[1], 'code block').not.toMatch(/^---\s*$|<section|<script|\{@html/m);
    }
    // Every mention of Reveal, HTML sinks or raw markup sits in a prohibition.
    for (const line of text.split('\n')) {
      if (/Reveal|\{@html\}|raw HTML/.test(line)) {
        expect(line, line).toMatch(
          /\b(?:not|never|Never|Do not)\b|^\s*`<section>`|^\s*or `\{@html\}`/
        );
      }
    }
    expect(text).toMatch(/Do not write Reveal\.js Markdown/);
  });

  it('has resolving relative links and in-page anchors', () => {
    const anchors = new Set(
      [...text.matchAll(/^#{1,6} (.+)$/gm)].map(([, heading]) =>
        (heading ?? '')
          .trim()
          .toLowerCase()
          .replace(/[^\p{L}\p{N}\s_-]/gu, '')
          .replace(/\s/g, '-')
      )
    );
    for (const [, target, anchor] of text.matchAll(/\]\(([^)#\s]*)(?:#([^)\s]*))?\)/g)) {
      if (/^[a-z]+:/.test(target ?? '')) continue;
      if (target)
        expect(existsSync(resolve(dirname(join(REPO, DECKS)), target)), target).toBe(true);
      else if (anchor) expect(anchors.has(anchor), `#${anchor}`).toBe(true);
    }
  });
});
