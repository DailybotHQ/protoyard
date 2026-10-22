import { describe, expect, it } from 'vitest';
import {
  APP_CUES,
  type BriefKindDetection,
  detectBriefKind,
  KIND_CUES,
} from '../src/brief/kind-detection.ts';
import { CONTENT_KINDS } from '../src/kinds/kind.ts';
import cases from './fixtures/briefs/briefs.json' with { type: 'json' };

const kindOf = (brief: string) => detectBriefKind(brief).kind;

describe('detectBriefKind: strong cues select a content kind', () => {
  it.each([
    ['A 10-slide pitch deck for a seed round of a bakery startup', 'deck'],
    ['Slides for my keynote at a design conference about color', 'deck'],
    ['A presentation on Q3 results for the board', 'deck'],
    ['Make a slideshow about the history of tea', 'deck'],
    ['PowerPoint for onboarding new hires', 'deck'],
    ['A landing page for a habit tracking newsletter with a waitlist', 'page'],
    ['Marketing site for a coffee roaster, one page, with pricing', 'page'],
    ['A coming soon page for our bike repair shop', 'page'],
    ['A pricing page for a photo storage service', 'page'],
    ['A one-pager that explains our refund policy', 'doc'],
    ['Write a quarterly report on support volume', 'doc'],
    ['An incident report for the outage last Tuesday', 'doc'],
    ['A whitepaper about offline-first sync', 'doc'],
    ['An onboarding handbook for the support team', 'doc'],
    ['A design doc for the new search ranking', 'doc'],
  ] as const)('%s → %s', (brief, kind) => {
    const result = detectBriefKind(brief);
    expect(result.kind).toBe(kind);
    expect(result.ambiguous).toBe(false);
    expect(result.confidence).toBe('high');
    expect(result.cues.some((cue) => cue.kind === kind && cue.strength === 'strong')).toBe(true);
    expect(result.reason).toMatch(/cues/i);
  });

  it('prefers the longest phrase, so "pitch deck" is one cue, not "pitch" + "deck"', () => {
    const { cues } = detectBriefKind('A pitch deck for investors');
    expect(cues).toEqual([{ kind: 'deck', phrase: 'pitch deck', strength: 'strong', index: 1 }]);
  });

  it('normalizes punctuation and case ("ONE-PAGER!" is "one pager")', () => {
    expect(detectBriefKind('Need a ONE-PAGER!').cues[0]).toMatchObject({
      kind: 'doc',
      phrase: 'one pager',
    });
  });

  it('keeps a content kind with medium confidence when app words only describe the subject', () => {
    const result = detectBriefKind('Slides that introduce our CRM app to the sales team');
    expect(result).toMatchObject({ kind: 'deck', confidence: 'medium', ambiguous: false });
    expect(result.reason).toContain('"crm"');
    expect(result.reason).toContain('"app"');
  });
});

describe('detectBriefKind: app is the fallback', () => {
  it('keeps every existing app brief fixture an app', () => {
    for (const fixture of cases) {
      const result = detectBriefKind(fixture.brief);
      expect({ id: fixture.id, kind: result.kind }).toEqual({ id: fixture.id, kind: 'app' });
    }
  });

  it('returns app with the default rationale when there is no cue at all', () => {
    expect(detectBriefKind('Something for my dog grooming salon')).toEqual({
      kind: 'app',
      confidence: 'fallback',
      ambiguous: false,
      reason: 'No deck, page or doc cue: app is the default kind.',
      cues: [],
      suggestion: null,
    } satisfies BriefKindDetection);
    expect(detectBriefKind('').kind).toBe('app');
  });

  it('names the app cues when only app cues are present', () => {
    const result = detectBriefKind('A dashboard for warehouse stock');
    expect(result).toMatchObject({ kind: 'app', confidence: 'fallback', ambiguous: false });
    expect(result.reason).toContain('"dashboard"');
  });

  it.each([
    ['A slide deck builder for teachers', 'slide deck builder'],
    ['A report generator for clinics', 'a report generator'],
    ['Landing page editor with drag and drop', 'landing page editor'],
    ['A presentation app with speaker timers', 'presentation app'],
    ['A reports dashboard for the finance team', 'reports dashboard'],
    ['A document management system for a law firm', 'a document management'],
  ])('reads "%s" as an app that makes content', (brief, phrase) => {
    const result = detectBriefKind(brief);
    expect(result.kind).toBe('app');
    expect(result.cues).toContainEqual(expect.objectContaining({ kind: 'app', phrase }));
  });

  it('ignores false friends such as a deck of cards or a presentation layer', () => {
    expect(kindOf('A game that shuffles a deck of cards')).toBe('app');
    expect(kindOf('Refactor the presentation layer of our API')).toBe('app');
    expect(detectBriefKind('A deck of cards').cues).toEqual([]);
  });

  it('treats a bare "report" as a weak cue (often a verb) and suggests doc', () => {
    const result = detectBriefKind('Volunteers report hours each week');
    expect(result).toMatchObject({ kind: 'app', confidence: 'fallback', suggestion: 'doc' });
    expect(result.reason).toBe(
      'Only weak doc cues ("report"): kept app. Pass kind "doc" to make a doc.'
    );
  });

  it('suggests, but never switches to, a kind backed only by weak cues', () => {
    const result = detectBriefKind('A talk about our webinar series');
    expect(result).toMatchObject({ kind: 'app', suggestion: 'deck', ambiguous: false });
  });

  it('keeps app, with a rationale, when an app noun comes before the content cue', () => {
    const result = detectBriefKind('An app for coaches, with a weekly report for each athlete');
    expect(result).toMatchObject({ kind: 'app', ambiguous: true, suggestion: 'doc' });
    expect(result.reason).toBe(
      'App cues ("app") come before the doc cues ("weekly report"): kept app. Pass kind "doc" to make a doc.'
    );
  });

  it('keeps app when two content kinds both have strong cues', () => {
    const result = detectBriefKind('A landing page and a pitch deck for our launch');
    expect(result).toMatchObject({ kind: 'app', ambiguous: true, suggestion: 'page' });
    expect(result.reason).toBe(
      'Cues for deck ("pitch deck") and page ("landing page") conflict: kept app. Pass the kind you want explicitly.'
    );
  });
});

describe('detectBriefKind: explicit kind and determinism', () => {
  it('lets an explicit kind override every cue and still reports them', () => {
    const result = detectBriefKind('A landing page for our app', { kind: 'doc' });
    expect(result).toMatchObject({ kind: 'doc', confidence: 'explicit', ambiguous: false });
    expect(result.cues.map((cue) => cue.kind)).toEqual(['page', 'app']);
    expect(detectBriefKind('Slides about tea', { kind: 'app' }).kind).toBe('app');
  });

  it('throws a RangeError for an explicit kind this version does not know', () => {
    expect(() => detectBriefKind('x', { kind: 'poster' as never })).toThrow(RangeError);
    expect(() => detectBriefKind('x', { kind: 'poster' as never })).toThrow(/newer Protoyard/);
  });

  it('returns the same result for the same brief, every time', () => {
    const brief = 'A keynote, a landing page, and an app for event check-in';
    const first = detectBriefKind(brief);
    for (let i = 0; i < 5; i++) expect(detectBriefKind(brief)).toEqual(first);
  });

  it('reads only the first 5,000 characters', () => {
    const late = `${'tea '.repeat(1_300)}slides`;
    expect(late.length).toBeGreaterThan(5_000);
    expect(kindOf(late)).toBe('app');
    expect(kindOf(`slides ${'tea '.repeat(1_300)}`)).toBe('deck');
  });

  it('keeps cue lists normalized, lowercase and unique', () => {
    const lists = [
      APP_CUES,
      ...CONTENT_KINDS.flatMap((kind) => [KIND_CUES[kind].strong, KIND_CUES[kind].weak]),
    ];
    const all = lists.flat();
    for (const phrase of all) expect(phrase).toMatch(/^[a-z]+( [a-z]+)*$/);
    expect(new Set(all).size).toBe(all.length);
  });
});
