import { describe, expect, it } from 'vitest';
import {
  applyOutlineBounds,
  blueprintFromBrief,
  boundBriefInput,
  checkOutlineBounds,
  MAX_BRIEF_LENGTH,
  MAX_CONTENT_BRIEF_LENGTH,
  OUTLINE_LIMITS,
  prepareBriefForSynthesis,
  synthesizeAppFromBrief,
  synthesizeDeckFromBrief,
  synthesizeDocFromBrief,
  synthesizePageFromBrief,
} from '../src/brief/index.ts';
import { detectBriefKind } from '../src/brief/kind-detection.ts';

describe('brief length caps', () => {
  it('keeps MAX_BRIEF_LENGTH and content cap aligned at 5000', () => {
    expect(MAX_BRIEF_LENGTH).toBe(5_000);
    expect(MAX_CONTENT_BRIEF_LENGTH).toBe(MAX_BRIEF_LENGTH);
  });

  it('bounds briefs at the limit without notices', () => {
    const exact = 'a'.repeat(MAX_BRIEF_LENGTH);
    const result = boundBriefInput(exact);
    expect(result.truncated).toBe(false);
    expect(result.brief).toBe(exact);
    expect(result.notices).toEqual([]);
  });

  it('truncates over-limit briefs with a stable notice', () => {
    const long = `${'x'.repeat(MAX_BRIEF_LENGTH)}OVERFLOW`;
    const first = boundBriefInput(long);
    const second = boundBriefInput(long);
    expect(first).toEqual(second);
    expect(first.truncated).toBe(true);
    expect(first.brief).toHaveLength(MAX_BRIEF_LENGTH);
    expect(first.originalLength).toBe(long.length);
    expect(first.notices).toEqual([
      `Brief truncated from ${long.length} to ${MAX_BRIEF_LENGTH} characters (MAX_BRIEF_LENGTH).`,
    ]);
    expect(prepareBriefForSynthesis(long)).toEqual(first);
  });
});

describe('outline structure bounds for all four kinds', () => {
  it('accepts empty scaffolding for app, deck, page and doc', () => {
    for (const kind of ['app', 'deck', 'page', 'doc'] as const) {
      const result = checkOutlineBounds({ kind });
      expect(result.ok, kind).toBe(true);
    }
  });

  it('rejects too many slides on a deck and too many sections on page/doc', () => {
    const deck = checkOutlineBounds({
      kind: 'deck',
      slides: Array.from({ length: OUTLINE_LIMITS.maxSlides + 1 }, (_, index) => ({
        id: `s${index}`,
        title: `Slide ${index}`,
      })),
    });
    expect(deck.ok).toBe(false);
    if (deck.ok) return;
    expect(deck.issues[0]?.code).toBe('too-many-slides');
    expect(deck.issues[0]?.limit).toBe(OUTLINE_LIMITS.maxSlides);

    const page = checkOutlineBounds({
      kind: 'page',
      sections: Array.from({ length: OUTLINE_LIMITS.maxSections + 1 }, (_, index) => ({
        id: `sec${index}`,
      })),
    });
    expect(page.ok).toBe(false);
    if (page.ok) return;
    expect(page.issues[0]?.code).toBe('too-many-sections');

    const doc = checkOutlineBounds({
      kind: 'doc',
      sections: Array.from({ length: OUTLINE_LIMITS.maxSections + 1 }, () => ({})),
    });
    expect(doc.ok).toBe(false);
  });

  it('rejects oversized titles, bodies, text and block lists', () => {
    const result = checkOutlineBounds({
      kind: 'deck',
      title: 'T'.repeat(OUTLINE_LIMITS.maxTitleLength + 1),
      slides: [
        {
          id: 's1',
          title: 'ok',
          body: 'B'.repeat(OUTLINE_LIMITS.maxBodyLength + 1),
          text: 'X'.repeat(OUTLINE_LIMITS.maxTextLength + 1),
          blocks: Array.from({ length: OUTLINE_LIMITS.maxBlocksPerUnit + 1 }, () => ({
            type: 'text',
          })),
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const codes = result.issues.map((issue) => issue.code).sort();
    expect(codes).toEqual(
      ['body-too-long', 'text-too-long', 'title-too-long', 'too-many-blocks'].sort()
    );
  });

  it('rejects cross-kind outline collections', () => {
    expect(checkOutlineBounds({ kind: 'deck', sections: [{ id: 'x' }] }).ok).toBe(false);
    expect(checkOutlineBounds({ kind: 'page', slides: [{ id: 'x' }] }).ok).toBe(false);
    expect(checkOutlineBounds({ kind: 'app', slides: [{ id: 'x' }] }).ok).toBe(false);
    expect(checkOutlineBounds({ kind: 'app', sections: [{ id: 'x' }] }).ok).toBe(false);
  });

  it('applyOutlineBounds clips deterministically and clears structure issues', () => {
    const input = {
      kind: 'deck' as const,
      title: 'T'.repeat(OUTLINE_LIMITS.maxTitleLength + 10),
      slides: Array.from({ length: OUTLINE_LIMITS.maxSlides + 5 }, (_, index) => ({
        id: `slide-${index}`,
        title: `S${index}-${'y'.repeat(OUTLINE_LIMITS.maxTitleLength)}`,
        body: 'z'.repeat(OUTLINE_LIMITS.maxBodyLength + 3),
        blocks: Array.from({ length: OUTLINE_LIMITS.maxBlocksPerUnit + 2 }, () => 1),
      })),
    };
    const first = applyOutlineBounds(input);
    const second = applyOutlineBounds(input);
    expect(first).toEqual(second);
    expect(first.truncated).toBe(true);
    expect(first.outline.slides).toHaveLength(OUTLINE_LIMITS.maxSlides);
    expect(first.outline.title?.length).toBe(OUTLINE_LIMITS.maxTitleLength);
    expect(first.outline.slides?.[0]?.body?.length).toBe(OUTLINE_LIMITS.maxBodyLength);
    expect(first.outline.slides?.[0]?.blocks).toHaveLength(OUTLINE_LIMITS.maxBlocksPerUnit);
    expect(checkOutlineBounds(first.outline).ok).toBe(true);
    expect(first.notices.length).toBeGreaterThan(0);
  });

  it('applyOutlineBounds clips page and doc sections the same way', () => {
    for (const kind of ['page', 'doc'] as const) {
      const applied = applyOutlineBounds({
        kind,
        sections: Array.from({ length: OUTLINE_LIMITS.maxSections + 2 }, (_, index) => ({
          id: `sec-${index}`,
          title: 'ok',
        })),
      });
      expect(applied.outline.sections).toHaveLength(OUTLINE_LIMITS.maxSections);
      expect(applied.truncated).toBe(true);
      expect(checkOutlineBounds(applied.outline).ok).toBe(true);
    }
  });
});

describe('synthesis preserves brief bounds for all four kinds', () => {
  const overflow = `CRM tracker for deals. ${'word '.repeat(MAX_BRIEF_LENGTH)}`;

  it('app synthesis truncates and records the notice', () => {
    const result = synthesizeAppFromBrief(overflow);
    expect(result.rationale.some((line) => line.includes('Brief truncated'))).toBe(true);
    const short = synthesizeAppFromBrief(overflow.slice(0, MAX_BRIEF_LENGTH));
    expect(short.rationale.some((line) => line.includes('Brief truncated'))).toBe(false);
  });

  it('deck, page and doc synthesis truncate the same way', () => {
    const deckCue = `pitch deck slides keynote ${overflow}`;
    const pageCue = `landing page hero ${overflow}`;
    const docCue = `handbook report document ${overflow}`;
    const deck = synthesizeDeckFromBrief(deckCue, detectBriefKind(deckCue));
    const page = synthesizePageFromBrief(pageCue, detectBriefKind(pageCue));
    const doc = synthesizeDocFromBrief(docCue, detectBriefKind(docCue));
    for (const result of [deck, page, doc]) {
      expect(result.rationale.some((line) => line.includes('Brief truncated'))).toBe(true);
    }
  });

  it('blueprintFromBrief stays deterministic on over-limit input for each kind', () => {
    const cases: { brief: string; kind: 'app' | 'deck' | 'page' | 'doc' }[] = [
      { brief: `manage deals ${overflow}`, kind: 'app' },
      { brief: `slide deck ${overflow}`, kind: 'deck' },
      { brief: `landing page ${overflow}`, kind: 'page' },
      { brief: `status report document ${overflow}`, kind: 'doc' },
    ];
    for (const { brief, kind } of cases) {
      const a = blueprintFromBrief(brief, { kind });
      const b = blueprintFromBrief(brief, { kind });
      expect(a, kind).toEqual(b);
      if (kind === 'app') {
        expect('blueprint' in a).toBe(true);
      } else {
        expect('json' in a).toBe(true);
      }
    }
  });
});

describe('outline limits agree with block text ceilings', () => {
  it('body and text caps match the block short/long markdown sizes', () => {
    // Mirrored from @protoyard/blocks BLOCK_CONTENT_LIMITS (no hard dep).
    expect(OUTLINE_LIMITS.maxBodyLength).toBe(600);
    expect(OUTLINE_LIMITS.maxTextLength).toBe(4_000);
    expect(OUTLINE_LIMITS.maxBlocksPerUnit).toBe(12);
  });
});
