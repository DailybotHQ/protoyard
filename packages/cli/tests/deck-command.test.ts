// @vitest-environment node
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cli, createWorkspace, type TempWorkspace } from './helpers.ts';

/**
 * `protoyard deck …` (Task 10, AC-deck-cli): the schema, the layout and
 * block catalogs, lint with JSON pointers, inspect from a pasted reference,
 * and capabilities — each in text and `--json`, with the CLI's exit codes.
 */

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const EXAMPLE = JSON.parse(readFileSync(join(REPO, 'blueprints/decks/example.json'), 'utf8')) as {
  deck: { slides: { id: string }[] };
};

let ws: TempWorkspace;
const deck = (...args: string[]) => cli(['--root', ws.root, 'deck', ...args]);
const deckJson = (...args: string[]) => cli(['--root', ws.root, '--json', 'deck', ...args]);

beforeEach(() => {
  ws = createWorkspace();
  ws.write('decks/example.json', EXAMPLE);
  ws.write('prototypes/demo-deck/blueprint.json', EXAMPLE);
  // A bare deck (no blueprint wrapper) with an error and a warning.
  ws.write('decks/broken.json', {
    style: {},
    slides: [
      {
        id: 'cover',
        layout: 'image-left',
        props: {
          title: 'Broken',
          body: 'An image with no description.',
          image: { src: 'media/cover.webp', width: 800, height: 600, alt: '' },
        },
      },
    ],
  });
});
afterEach(() => ws.cleanup());

describe('deck inspect', () => {
  it('never reads outside the workspace for a pasted reference (security review)', async () => {
    // A JSON deck and a secret outside the workspace, plus a symlink to the deck inside it.
    const outside = mkdtempSync(join(tmpdir(), 'protoyard-outside-'));
    try {
      writeFileSync(join(outside, 'deck.json'), JSON.stringify(EXAMPLE));
      writeFileSync(join(outside, 'secret.env'), 'SECRET_TOKEN=do-not-print');
      symlinkSync(join(outside, 'deck.json'), join(ws.root, 'decks', 'linked.json'));
      const escapes = [
        `blueprint:${join(outside, 'deck.json')}`,
        `blueprint:${relative(ws.root, join(outside, 'deck.json'))}`,
        'blueprint:decks/../../deck.json',
        'blueprint:decks/x.json?/../../deck.json',
        'prototype:../demo-deck',
      ];
      for (const source of escapes) {
        const result = await deckJson('inspect', '--ref', `[slide-ref] id=open source=${source}`);
        expect(result.code, source).not.toBe(0);
        expect(result.stdout + result.stderr, source).not.toContain('"slide"');
      }
      // A symlink inside the workspace that points out of it is refused too.
      const linked = await deckJson(
        'inspect',
        '--ref',
        '[slide-ref] id=open source=blueprint:decks/linked.json'
      );
      expect(linked.code).toBe(4);

      // So is a pasted prototype whose blueprint.json is a symlink out of it
      // (Final Review area B, finding 6).
      mkdirSync(join(ws.root, 'prototypes', 'escaped-deck'), { recursive: true });
      symlinkSync(
        join(outside, 'deck.json'),
        join(ws.root, 'prototypes', 'escaped-deck', 'blueprint.json')
      );
      const escaped = await deckJson(
        'inspect',
        '--ref',
        '[slide-ref] id=open source=prototype:escaped-deck'
      );
      expect(escaped.code).toBe(4);
      expect(escaped.stdout + escaped.stderr).not.toContain('"slide"');

      // A file that is not JSON is named, never quoted.
      ws.write('decks/notes.json', 'SECRET_TOKEN=do-not-print');
      const notJson = await deck('inspect', 'decks/notes.json', '--slide', 'open');
      expect(notJson.code).toBe(4);
      expect(notJson.stdout + notJson.stderr).toContain('is not valid JSON.');
      expect(notJson.stdout + notJson.stderr).not.toContain('SECRET');
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('prints slide text inert: no bidirectional or control characters reach the terminal', async () => {
    const hostile = structuredClone(EXAMPLE) as { deck: { slides: { notes?: string }[] } };
    const slide = hostile.deck.slides[0];
    if (slide) slide.notes = 'Read \u202Ethis\u202C and \u001b[31mred\u001b[0m.';
    ws.write('decks/hostile.json', hostile);
    const text = await deck('inspect', 'decks/hostile.json', '--slide', 'open');
    expect(text.code).toBe(0);
    expect(text.stdout).not.toContain(String.fromCharCode(0x1b));
    expect(text.stdout).not.toMatch(/[\u202a-\u202e\u2066-\u2069]/);
    expect(text.stdout).toContain('\\u202e');
  });
});

describe('deck from-markdown', () => {
  const MARKDOWN = `---
title: Harbor kickoff
---

<!-- .slide: id=cover layout=title-hero -->

# Harbor kickoff

Fictional figures only

---

## The plan

- Agree on the scope <!-- .element: fragment -->
- Ship the first slice <!-- .element: fragment -->

Note: Reveal one step at a time and keep each line short for the room.
`;

  describe('--out is guarded like every file the CLI writes from untrusted data', () => {
    const refused = async (out: string, ...extra: string[]) => {
      const run = await deckJson('from-markdown', 'talk.md', '--out', out, ...extra);
      expect(run.code).not.toBe(0);
      expect(run.json<{ ok: boolean; error: { code: string } }>().error.code).toBe('unsafe_path');
    };

    it('never writes through a symlinked file, a dangling symlink or a symlinked folder', async () => {
      ws.write('talk.md', MARKDOWN);
      ws.write('victim.txt', 'keep\n');
      mkdirSync(join(ws.root, 'tmp'), { recursive: true });
      // A link to an existing file (with --force).
      symlinkSync(join(ws.root, 'victim.txt'), join(ws.root, 'tmp/link.json'));
      await refused('tmp/link.json', '--force');
      expect(readFileSync(join(ws.root, 'victim.txt'), 'utf8')).toBe('keep\n');
      // A dangling link: existsSync() is false for it, the guard still refuses.
      symlinkSync(join(ws.root, 'planted.json'), join(ws.root, 'tmp/dangling.json'));
      await refused('tmp/dangling.json');
      expect(existsSync(join(ws.root, 'planted.json'))).toBe(false);
      // A symlinked parent folder pointing out of the safe zone.
      mkdirSync(join(ws.root, 'src-real'), { recursive: true });
      symlinkSync(join(ws.root, 'src-real'), join(ws.root, 'tmp/linked-dir'));
      await refused('tmp/linked-dir/x.json');
      expect(existsSync(join(ws.root, 'src-real/x.json'))).toBe(false);
      // A link back to the workspace root: the path still goes through a symlink.
      symlinkSync(ws.root, join(ws.root, 'tmp/root-link'));
      await refused('tmp/root-link/tmp/x.json');
      expect(existsSync(join(ws.root, 'tmp/x.json'))).toBe(false);
    });
  });

  it('reports Markdown issues with their line and column, and refuses HTML and remote media', async () => {
    ws.write(
      'bad.md',
      `---\ntitle: Bad\n---\n\n# Hello <script>alert(1)</script>\n\n---\n\n<!-- .slide: layout=image-centered -->\n\n![A diagram](https://example.com/a.webp)\n`
    );
    const json = await deckJson('from-markdown', 'bad.md');
    expect(json.code).not.toBe(0);
    const issues = json.json<{
      data: { valid: boolean; issues: { severity: string; line?: number }[] };
    }>().data.issues;
    expect(issues.some((issue) => issue.severity === 'error')).toBe(true);
    expect(issues.some((issue) => typeof issue.line === 'number')).toBe(true);
    expect(existsSync(join(ws.root, 'decks/bad.json'))).toBe(false);
  });
});
