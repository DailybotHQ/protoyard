// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_UNTRUSTED_DOCUMENT_LIMITS,
  decodeDocumentShare,
  encodeBlueprintShare,
  loadUntrustedBlueprint,
  loadUntrustedDocument,
  type UntrustedDocumentResult,
} from '../../src/index.ts';

const ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
const fixture = (name: string) =>
  JSON.parse(
    readFileSync(join(ROOT, 'packages/blueprint/tests/fixtures/kinds', name), 'utf8')
  ) as Record<
    string,
    // biome-ignore lint/suspicious/noExplicitAny: fixtures are edited freely in tests.
    any
  >;
const app = () =>
  JSON.parse(readFileSync(join(ROOT, 'blueprints/crm.json'), 'utf8')) as Record<string, unknown>;

/** The intro deck plus one free slide holding `blocks` (and speaker notes). */
function deck(blocks: unknown[] = [{ type: 'heading', text: 'Hello' }], notes?: string) {
  const doc = fixture('intro.deck.json');
  doc.deck.slides.push({
    id: 'free-one',
    layout: 'free',
    title: 'Free',
    blocks,
    ...(notes ? { notes } : {}),
  });
  doc.deck.outline.sections[0].slideIds.push('free-one');
  return doc;
}

/** The quarterly report doc with `blocks` appended. */
function doc(blocks: unknown[] = []) {
  const value = fixture('quarterly-report.doc.json');
  value.doc.blocks.push(...blocks);
  return value;
}

function expectIssue(result: UntrustedDocumentResult, code: string, path?: (string | number)[]) {
  expect(result.success, JSON.stringify(result.issues)).toBe(false);
  expect(result.issues[0]?.code).toBe(code);
  if (path) expect(result.issues[0]?.path).toEqual(path);
}

const chart = (labels: number, series: number) => ({
  type: 'chart',
  spec: {
    kind: 'line',
    title: 'Trend',
    labels: Array.from({ length: labels }, (_, i) => `L${i}`),
    series: Array.from({ length: series }, (_, s) => ({
      label: `S${s}`,
      values: Array.from({ length: labels }, (_, i) => i),
    })),
  },
});

describe('loadUntrustedDocument: kinds', () => {
  it('loads each content fixture and keeps apps on the app loader contract', async () => {
    for (const name of ['intro.deck.json', 'landing.page.json', 'quarterly-report.doc.json']) {
      const result = await loadUntrustedDocument(JSON.stringify(fixture(name)));
      expect(result.success, `${name}: ${JSON.stringify(result.issues)}`).toBe(true);
    }
    const raw = app();
    expect(await loadUntrustedDocument(raw)).toEqual(loadUntrustedBlueprint(raw));
    expect(await loadUntrustedDocument(JSON.stringify(raw))).toEqual(
      loadUntrustedBlueprint(JSON.stringify(raw))
    );
  });

  it('explains an unknown kind', async () => {
    const result = await loadUntrustedDocument({ ...doc(), kind: 'quiz' });
    expectIssue(result, 'invalid-blueprint', ['kind']);
    expect(result.issues[0]?.message).toMatch(/needs a newer Protoyard/);
  });
});

describe('loadUntrustedDocument: text', () => {
  it('keeps newlines in speaker notes, markdown and list items, and tabs in code', async () => {
    const notes = 'First point\r\nSecond point\nThird\u202e point';
    const deckResult = await loadUntrustedDocument(deck([{ type: 'heading', text: 'Hi' }], notes));
    expect(deckResult.success, JSON.stringify(deckResult.issues)).toBe(true);
    if (!deckResult.success) return;
    const slides = (deckResult.blueprint as { deck: { slides: { id: string; notes?: string }[] } })
      .deck.slides;
    expect(slides.find((s) => s.id === 'free-one')?.notes).toBe(
      'First point\nSecond point\nThird point'
    );

    const docResult = await loadUntrustedDocument(
      doc([
        { type: 'text', markdown: 'Line one\nLine two\u2066' },
        { type: 'code', lang: 'ts', code: 'if (ok) {\n\treturn 1;\n}' },
        { type: 'list', items: [{ text: 'Item\nwith a break' }] },
      ])
    );
    expect(docResult.success, JSON.stringify(docResult.issues)).toBe(true);
    if (!docResult.success) return;
    const blocks = (docResult.blueprint as { doc: { blocks: Record<string, unknown>[] } }).doc
      .blocks;
    expect(blocks.at(-3)?.markdown).toBe('Line one\nLine two');
    expect(blocks.at(-2)?.code).toBe('if (ok) {\n\treturn 1;\n}');
    expect((blocks.at(-1)?.items as { text: string }[] | undefined)?.[0]?.text).toBe(
      'Item\nwith a break'
    );
  });

  it('still strips newlines, tabs and bidi controls from titles, labels and names', async () => {
    const value = deck([{ type: 'heading', text: 'Head\ning\twith\u202a breaks' }]);
    value.name = 'Line\nbreak name';
    value.deck.slides[1].title = 'Free\r\nslide';
    const result = await loadUntrustedDocument(value);
    expect(result.success, JSON.stringify(result.issues)).toBe(true);
    if (!result.success) return;
    const loaded = result.blueprint as unknown as {
      name: string;
      deck: { slides: { title?: string; blocks?: { text: string }[] }[] };
    };
    expect(loaded.name).toBe('Linebreak name');
    expect(loaded.deck.slides[1]?.title).toBe('Freeslide');
    expect(loaded.deck.slides[1]?.blocks?.[0]?.text).toBe('Headingwith breaks');
  });
});

describe('loadUntrustedDocument: caps', () => {
  it('refuses more slides than the cap', async () => {
    const value = fixture('intro.deck.json');
    const first = value.deck.slides[0];
    value.deck.slides = Array.from(
      { length: DEFAULT_UNTRUSTED_DOCUMENT_LIMITS.maxSlides + 1 },
      (_, i) => ({
        ...first,
        id: `s-${i}`,
      })
    );
    expectIssue(await loadUntrustedDocument(value), 'too-many', ['deck', 'slides']);
  });

  it('refuses too many blocks on one slide, nested container blocks included', async () => {
    const heading = { type: 'heading', text: 'x' };
    const flat = Array.from({ length: 150 }, () => heading);
    const nested = { type: 'columns', columns: [Array(30).fill(heading), Array(30).fill(heading)] };
    const result = await loadUntrustedDocument(deck([...flat, nested]));
    expectIssue(result, 'too-many');
    expect(result.issues[0]?.message).toMatch(/A slide has more than 200 blocks/);
  });

  it('refuses more blocks than the document cap', async () => {
    const result = await loadUntrustedDocument(
      doc(
        Array.from({ length: DEFAULT_UNTRUSTED_DOCUMENT_LIMITS.maxBlocks }, () => ({
          type: 'divider',
        }))
      )
    );
    expectIssue(result, 'too-many');
    expect(result.issues[0]?.message).toMatch(/blocks; the limit is 2000/);
  });

  it('refuses more chart points than the cap', async () => {
    const charts = Array.from({ length: 9 }, () => chart(366, 8));
    const result = await loadUntrustedDocument(doc(charts));
    expectIssue(result, 'too-many');
    expect(result.issues[0]?.message).toMatch(/chart points/);
    expect(result.issues[0]?.path.at(-1)).toBe('spec');
  });

  it('lets callers lower the caps but never raise them', async () => {
    const value = doc([chart(10, 2), chart(10, 2)]);
    expect((await loadUntrustedDocument(value)).success).toBe(true);
    expectIssue(await loadUntrustedDocument(value, { maxChartPoints: 30 }), 'too-many');
    const tooBig = { ...value, description: 'x'.repeat(10) };
    expectIssue(
      await loadUntrustedDocument(JSON.stringify(tooBig), { maxBytes: 100 }),
      'too-large'
    );
    // A raised cap is ignored: 9 full charts stay refused.
    const charts = doc(Array.from({ length: 9 }, () => chart(366, 8)));
    expectIssue(await loadUntrustedDocument(charts, { maxChartPoints: 10_000_000 }), 'too-many');
  });

  it('refuses oversized and too-deep input before parsing', async () => {
    const huge = `{"kind":"doc","pad":"${'p'.repeat(DEFAULT_UNTRUSTED_DOCUMENT_LIMITS.maxBytes)}"}`;
    expectIssue(await loadUntrustedDocument(huge), 'too-large');
    expectIssue(await loadUntrustedDocument(`${'['.repeat(40)}${']'.repeat(40)}`), 'too-deep');
    expectIssue(await loadUntrustedDocument('{not json'), 'invalid-json');
  });
});

describe('loadUntrustedDocument: chart points across deck chart slides', () => {
  it('counts catalog chart slides against the document chart-point cap', async () => {
    const doc = fixture('intro.deck.json');
    const labels = Array.from({ length: 200 }, (_, i) => `P${i + 1}`);
    const series = Array.from({ length: 8 }, (_, s) => ({
      label: `Series ${s + 1}`,
      values: labels.map((_, i) => i + s),
    }));
    for (let i = 0; i < 40; i++) {
      const id = `chart-${i + 1}`;
      doc.deck.slides.push({
        id,
        layout: 'chart',
        props: { title: 'Load', spec: { kind: 'line', title: `Chart ${i + 1}`, labels, series } },
      });
      doc.deck.outline.sections[0].slideIds.push(id);
    }
    const result = await loadUntrustedDocument(doc);
    expectIssue(result, 'too-many');
    const issue = result.issues[0];
    expect(issue?.path.slice(0, 2)).toEqual(['deck', 'slides']);
    expect(issue?.path.slice(-2)).toEqual(['props', 'spec']);
    expect(issue?.message).toContain(
      `limit is ${DEFAULT_UNTRUSTED_DOCUMENT_LIMITS.maxChartPoints}`
    );
  });
});

describe('loadUntrustedDocument: embedded apps', () => {
  const embed = (appValue: unknown) => ({
    type: 'embed-app',
    id: 'demo',
    title: 'Try it',
    app: appValue,
  });

  it('accepts an embedded app that passes the app loader', async () => {
    const result = await loadUntrustedDocument(doc([embed(app())]));
    expect(result.success, JSON.stringify(result.issues)).toBe(true);
  });

  it('refuses a deck, page or doc as an embedded app', async () => {
    const result = await loadUntrustedDocument(doc([embed(fixture('intro.deck.json'))]));
    expectIssue(result, 'invalid-blueprint');
    expect(result.issues[0]?.path.slice(-2)).toEqual(['app', 'kind']);
  });

  it('refuses an embedded app that embeds another app (one level only)', async () => {
    const nested = { ...app(), extra: [embed(app())] };
    const result = await loadUntrustedDocument(doc([embed(nested)]));
    expectIssue(result, 'too-deep');
  });

  it('refuses two blocks that share an id on different slides (one storage namespace)', async () => {
    const twoSlides = deck([embed(app())]);
    twoSlides.deck.slides.push({
      id: 'free-two',
      layout: 'free',
      title: 'Free two',
      blocks: [embed({ ...app(), name: 'Another app' })],
    });
    twoSlides.deck.outline.sections[0].slideIds.push('free-two');
    const result = await loadUntrustedDocument(twoSlides);
    expect(result.success).toBe(false);
    const issue = result.issues.find((entry) =>
      entry.message.includes('unique across the document')
    );
    expect(issue?.path.slice(-3)).toEqual(['blocks', 0, 'id']);
    expect(issue?.path).toContain(twoSlides.deck.slides.length - 1);

    // The same app under distinct ids is fine.
    const distinct = deck([embed(app())]);
    distinct.deck.slides.push({
      id: 'free-two',
      layout: 'free',
      title: 'Free two',
      blocks: [{ ...embed(app()), id: 'demo-two' }],
    });
    distinct.deck.outline.sections[0].slideIds.push('free-two');
    const ok = await loadUntrustedDocument(distinct);
    expect(ok.success, JSON.stringify(ok.issues)).toBe(true);
  });

  it('refuses page blocks that share an id within or across sections', async () => {
    const poll = (question: string) => ({
      type: 'poll',
      id: 'vote',
      question,
      options: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
    });
    const across = fixture('landing.page.json');
    across.page.sections[0].blocks.push(poll('First?'));
    across.page.sections[1].blocks.push(poll('Second?'));
    const crossResult = await loadUntrustedDocument(across);
    expect(crossResult.success).toBe(false);
    expect(
      crossResult.issues.some((entry) => entry.message.includes('Block id "vote" is already used'))
    ).toBe(true);

    const within = fixture('landing.page.json');
    within.page.sections[0].blocks.push(poll('First?'), poll('Again?'));
    const withinResult = await loadUntrustedDocument(within);
    expect(withinResult.success).toBe(false);
  });

  it('checks each embedded app with the app caps and reports its own path', async () => {
    const bad = { ...app(), roles: [] };
    const result = await loadUntrustedDocument(doc([embed(bad)]));
    expect(result.success).toBe(false);
    expect(result.issues[0]?.path.slice(0, 4)).toEqual(['doc', 'blocks', 9, 'app']);
  });

  it('refuses more embedded apps than the cap', async () => {
    const many = Array.from(
      { length: DEFAULT_UNTRUSTED_DOCUMENT_LIMITS.maxEmbeddedApps + 1 },
      (_, i) => ({
        ...embed(app()),
        id: `demo-${i}`,
      })
    );
    const result = await loadUntrustedDocument(doc(many));
    expectIssue(result, 'too-many');
    expect(result.issues[0]?.message).toMatch(/embedded apps/);
  });
});

describe('document share links', () => {
  it('round-trips a deck with its notes newlines through a share link', async () => {
    const value = deck([{ type: 'heading', text: 'Hi' }], 'One\nTwo');
    const loaded = await loadUntrustedDocument(value);
    if (!loaded.success) throw new Error(JSON.stringify(loaded.issues));
    const link = await encodeBlueprintShare(loaded.blueprint);
    const decoded = await decodeDocumentShare(link);
    expect(decoded.success, JSON.stringify(decoded.issues)).toBe(true);
    if (decoded.success) expect(decoded.blueprint).toEqual(loaded.blueprint);
  });

  it('decodes app links through the document decoder too, and refuses garbage', async () => {
    const loaded = loadUntrustedBlueprint(app());
    if (!loaded.success) throw new Error('fixture');
    const decoded = await decodeDocumentShare(
      `#bp=${await encodeBlueprintShare(loaded.blueprint)}`
    );
    expect(decoded.success).toBe(true);
    expect((await decodeDocumentShare('1.***')).issues[0]?.code).toBe('invalid-link');
  });
});
