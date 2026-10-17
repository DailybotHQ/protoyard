import { describe, expect, it } from 'vitest';
import { agentPrompt, newCommand, shellQuote } from '../src/lib/commands';
import { localDevUrl } from '../src/lib/control.svelte';
import { clampDimension, fitScale, safePreviewUrl } from '../src/lib/devices';
import {
  applyQuery,
  DEFAULT_QUERY,
  haystack,
  paramsFromQuery,
  queryFromParams,
} from '../src/lib/search';
import type { CompactEntry } from '../src/lib/types';

const entry = (s: string, patch: Partial<CompactEntry> = {}): CompactEntry => ({
  k: 'prototype',
  s,
  n: s,
  d: '',
  c: 'general',
  t: [],
  p: 'responsive',
  st: 'active',
  tp: null,
  i: null,
  sc: 1,
  m: '2026-01-01T00:00:00.000Z',
  th: null,
  e: null,
  ...patch,
});

const entries = [
  entry('crm', { n: 'Pipeline CRM', t: ['sales'], c: 'sales', m: '2026-03-01T00:00:00.000Z' }),
  entry('bank', { n: 'Lumen Bank', d: 'Transfers and cards', p: 'mobile', c: 'fintech' }),
  entry('café', { n: 'Café Orders', t: ['food'] }),
  entry('blank', { n: 'Blank', k: 'template' }),
];
const index = entries.map((e) => ({ entry: e, text: haystack(e) }));
const lib = { favorites: ['bank'], recent: ['café', 'crm'] };
const slugs = (patch: Partial<typeof DEFAULT_QUERY>) =>
  applyQuery(index, { ...DEFAULT_QUERY, ...patch }, lib).map((e) => e.s);

describe('gallery search', () => {
  it('filters by kind and sorts by name by default', () => {
    expect(slugs({})).toEqual(['café', 'bank', 'crm']);
    expect(slugs({ kind: 'template' })).toEqual(['blank']);
    expect(slugs({ kind: 'all' })).toHaveLength(4);
  });

  it('matches every term, ignoring case and accents', () => {
    expect(slugs({ q: 'cafe' })).toEqual(['café']);
    expect(slugs({ q: 'LUMEN transfers' })).toEqual(['bank']);
    expect(slugs({ q: 'lumen sales' })).toEqual([]);
  });

  it('applies facets, favorites, recent order and modified sort', () => {
    expect(slugs({ platform: 'mobile' })).toEqual(['bank']);
    expect(slugs({ tag: 'sales', category: 'sales' })).toEqual(['crm']);
    expect(slugs({ view: 'favorites' })).toEqual(['bank']);
    expect(slugs({ view: 'recent' })).toEqual(['café', 'crm']);
    expect(slugs({ sort: 'modified' })[0]).toBe('crm');
  });

  it('filters 1,000 entries quickly', () => {
    const many = Array.from({ length: 1000 }, (_, i) =>
      entry(`app-${i}`, { n: `App ${i}`, t: [`t${i % 20}`] })
    );
    const big = many.map((e) => ({ entry: e, text: haystack(e) }));
    const started = performance.now();
    for (let i = 0; i < 50; i++) applyQuery(big, { ...DEFAULT_QUERY, q: `app ${i}` }, lib);
    expect((performance.now() - started) / 50).toBeLessThan(20);
  });

  it('round-trips the query through the URL and ignores junk', () => {
    const query = { ...DEFAULT_QUERY, q: 'crm', tag: 'sales', sort: 'modified' as const };
    expect(queryFromParams(new URLSearchParams(paramsFromQuery(query)))).toEqual(query);
    expect(paramsFromQuery(DEFAULT_QUERY)).toBe('');
    expect(queryFromParams(new URLSearchParams('kind=evil&sort=drop&view=x'))).toEqual(
      DEFAULT_QUERY
    );
  });
});

describe('gallery helpers', () => {
  it('builds paste-safe commands', () => {
    expect(newCommand({ slug: 'team-crm', template: 'blank', name: "Ana's CRM" })).toBe(
      `pnpm protoyard new team-crm --template blank --name 'Ana'\\''s CRM'`
    );
    expect(newCommand({ slug: '', template: '' })).toBe(
      'pnpm protoyard new <slug> --template <template>'
    );
    expect(shellQuote('$(rm -rf ~)')).toBe(`'$(rm -rf ~)'`);
    expect(agentPrompt({ slug: 'x-app', template: 'blank', idea: '' })).toContain(
      'pnpm protoyard new x-app --template blank'
    );
  });

  it('only frames http(s) URLs and clamps device sizes', () => {
    expect(safePreviewUrl('http://localhost:5173')).toBe('http://localhost:5173/');
    expect(safePreviewUrl('javascript:alert(1)')).toBeNull();
    expect(safePreviewUrl('not a url')).toBeNull();
    expect(localDevUrl('http://localhost:5173/')).toBe('http://localhost:5173/');
    expect(localDevUrl('http://127.0.0.1:5174')).toBe('http://127.0.0.1:5174/');
    expect(localDevUrl('https://evil.example/')).toBeNull();
    expect(localDevUrl('javascript:alert(1)')).toBeNull();
    expect(clampDimension(10)).toBe(240);
    expect(clampDimension(99999)).toBe(3840);
    expect(fitScale(640, 1280)).toBe(0.5);
    expect(fitScale(2000, 1280)).toBe(1);
  });
});
