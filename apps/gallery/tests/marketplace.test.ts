import { describe, expect, it } from 'vitest';
import {
  createCommand,
  createRequest,
  detailHref,
  EMPTY_QUERY,
  facets,
  filterMarket,
  groupRails,
  interpretCreate,
  isFiltered,
  label,
  type MarketEntry,
  type MarketSource,
  paramsFromQuery,
  queryFromParams,
  slugError,
  suggestSlug,
  toMarketEntry,
} from '../src/components/marketplace/model';

function source(overrides: Partial<MarketSource> = {}): MarketSource {
  return {
    kind: 'prototype',
    slug: 'crm-demo',
    name: 'Pipeline CRM',
    description: 'A lightweight sales CRM.',
    icon: '📈',
    scenarioCount: 6,
    catalog: {
      category: 'sales',
      productType: 'CRM',
      platforms: ['web'],
      shell: 'none',
      features: ['pipeline', 'roles'],
      difficulty: 'intermediate',
    },
    ...overrides,
  };
}

const entry = (overrides: Partial<MarketSource> = {}, thumb: string | null = null) =>
  toMarketEntry(source(overrides), thumb) as MarketEntry;

const shelf: MarketEntry[] = [
  entry(),
  entry({
    kind: 'template',
    slug: 'chat-widget',
    name: 'Chat widget',
    description: 'A compact support widget.',
    catalog: {
      category: 'support',
      productType: 'Support widget',
      platforms: ['widget'],
      shell: 'widget-host',
      features: ['chat', 'offline'],
    },
  }),
  entry({
    kind: 'prototype',
    slug: 'mobile-banking-demo',
    name: 'Lumen Bank',
    description: 'Mobile banking with transfers.',
    catalog: {
      category: 'finance',
      productType: 'Banking app',
      platforms: ['mobile'],
      shell: 'phone',
      features: ['transfers', 'offline'],
    },
  }),
  entry({
    kind: 'blueprint',
    slug: 'booking-scheduling',
    name: 'Calendar Booking',
    description: 'Services, slots and appointments.',
    scenarioCount: 0,
    catalog: {
      category: 'operations',
      productType: 'Booking',
      platforms: ['web'],
      shell: 'none',
      features: ['slots'],
    },
  }),
  entry({
    kind: 'template',
    slug: 'helpdesk-tpl',
    name: 'Ánother desk',
    description: 'Tickets.',
    catalog: {
      category: 'support',
      productType: 'Help desk',
      platforms: ['web'],
      shell: 'browser',
      features: ['tickets', 'offline'],
    },
  }),
];

describe('toMarketEntry', () => {
  it('shelves only entries with a catalog block in a shared category', () => {
    expect(entry({}, 'thumbnails/crm.png')).toMatchObject({
      k: 'prototype',
      c: 'sales',
      pt: 'CRM',
      sh: 'none',
      th: 'thumbnails/crm.png',
    });
    expect(toMarketEntry(source({ catalog: null }), null)).toBeNull();
    expect(toMarketEntry(source({ catalog: { category: 'helpdesks' } }), null)).toBeNull();
    expect(toMarketEntry(source({ kind: 'theme' }), null)).toBeNull();
  });
});

describe('filtering', () => {
  it('filters by kind, category, platform, shell and every selected feature', () => {
    const slugs = (q: Partial<typeof EMPTY_QUERY>) =>
      filterMarket(shelf, { ...EMPTY_QUERY, ...q }).map((e) => e.s);
    expect(slugs({ kind: 'blueprint' })).toEqual(['booking-scheduling']);
    expect(slugs({ category: 'support' })).toEqual(['helpdesk-tpl', 'chat-widget']);
    expect(slugs({ platform: 'mobile' })).toEqual(['mobile-banking-demo']);
    expect(slugs({ shell: 'widget-host' })).toEqual(['chat-widget']);
    expect(slugs({ features: ['offline'] })).toEqual([
      'mobile-banking-demo',
      'helpdesk-tpl',
      'chat-widget',
    ]);
    expect(slugs({ features: ['offline', 'chat'] })).toEqual(['chat-widget']);
  });

  it('searches name, description, product type and features, accent- and case-insensitive', () => {
    const slugs = (q: string) => filterMarket(shelf, { ...EMPTY_QUERY, q }).map((e) => e.s);
    expect(slugs('ANOTHER')).toEqual(['helpdesk-tpl']);
    expect(slugs('banking transfers')).toEqual(['mobile-banking-demo']);
    expect(slugs('crm pipeline')).toEqual(['crm-demo']);
    expect(slugs('no such product')).toEqual([]);
  });

  it('orders prototypes, then templates, then blueprints, by name', () => {
    expect(filterMarket(shelf, EMPTY_QUERY).map((e) => e.k)).toEqual([
      'prototype',
      'prototype',
      'template',
      'template',
      'blueprint',
    ]);
    expect(isFiltered(EMPTY_QUERY)).toBe(false);
    expect(isFiltered({ ...EMPTY_QUERY, features: ['chat'] })).toBe(true);
  });
});

describe('rails and facets', () => {
  it('groups rails in the shared catalog category order', () => {
    expect(groupRails(shelf).map(([category, items]) => [category, items.length])).toEqual([
      ['sales', 1],
      ['support', 2],
      ['finance', 1],
      ['operations', 1],
    ]);
  });

  it('counts facet values', () => {
    const f = facets(shelf);
    expect(f.kind).toEqual([
      ['prototype', 2],
      ['template', 2],
      ['blueprint', 1],
    ]);
    expect(f.features[0]).toEqual(['offline', 3]);
    expect(f.platform).toContainEqual(['web', 3]);
    expect(f.shell).toContainEqual(['phone', 1]);
  });
});

describe('URL state', () => {
  it('round-trips a filtered view and ignores unknown values', () => {
    const query = {
      ...EMPTY_QUERY,
      q: 'chat',
      kind: 'template' as const,
      category: 'support',
      features: ['chat', 'offline'],
    };
    const search = paramsFromQuery(query);
    expect(search).toBe('?q=chat&kind=template&category=support&feature=chat&feature=offline');
    expect(queryFromParams(new URLSearchParams(search))).toEqual(query);
    expect(queryFromParams(new URLSearchParams('kind=theme&category=helpdesks'))).toMatchObject({
      kind: '',
      category: '',
    });
    expect(paramsFromQuery(EMPTY_QUERY)).toBe('');
  });

  it('labels values and builds detail links per kind', () => {
    expect(label('developer-tools')).toBe('Developer tools');
    expect(label('ai')).toBe('AI');
    expect(label('widget-host')).toBe('Widget on a site');
    expect(label('finance')).toBe('Finance');
    expect(detailHref({ k: 'blueprint', s: 'booking-scheduling' })).toBe(
      '/marketplace/blueprint/booking-scheduling/'
    );
  });
});

describe('create flow', () => {
  const template = { k: 'template' as const, s: 'chat-widget' };
  const prototype = { k: 'prototype' as const, s: 'crm-demo' };
  const blueprint = { k: 'blueprint' as const, s: 'booking-scheduling' };

  it('validates and suggests slugs like the CLI', () => {
    expect(slugError('')).toMatch(/Choose/);
    expect(slugError('Team CRM')).toMatch(/kebab-case/);
    expect(slugError('a')).toMatch(/kebab-case/);
    expect(slugError('team-crm')).toBe('');
    expect(suggestSlug('Équipe CRM — 2026!')).toBe('equipe-crm-2026');
    expect(suggestSlug('42 Things')).toBe('things');
  });

  it('builds the /api/new request for templates and prototypes (remix), never for blueprints', () => {
    expect(createRequest(template, { slug: 'my-widget', name: ' Help ' })).toEqual({
      slug: 'my-widget',
      from: 'chat-widget',
      name: 'Help',
    });
    expect(createRequest(prototype, { slug: 'my-crm' })).toEqual({
      slug: 'my-crm',
      from: 'crm-demo',
    });
    expect(createRequest(blueprint, { slug: 'my-booking' })).toBeNull();
  });

  it('shows the exact CLI command for the read-only gallery', () => {
    expect(createCommand(template, { slug: 'my-widget', name: "Ann's help" })).toBe(
      "pnpm protoyard new my-widget --from chat-widget --name 'Ann'\\''s help'"
    );
    expect(createCommand(prototype, { slug: '' })).toBe(
      'pnpm protoyard new <slug> --from crm-demo'
    );
    expect(createCommand(blueprint, { slug: 'my-booking' })).toBe(
      'pnpm protoyard generate my-booking --blueprint blueprints/booking-scheduling.json'
    );
  });

  it('interprets every /api/new outcome and never opens a non-local URL', () => {
    const local = (url: string) => (url.startsWith('http://127.0.0.1:') ? url : null);
    expect(
      interpretCreate(
        { ok: true, slug: 'my-crm', linked: true, url: 'http://127.0.0.1:5180/' },
        true,
        local
      )
    ).toEqual({ state: 'running', slug: 'my-crm', url: 'http://127.0.0.1:5180/' });
    expect(
      interpretCreate(
        { ok: true, slug: 'my-crm', linked: true, url: 'https://evil.example/' },
        true,
        local
      )
    ).toMatchObject({ state: 'created', error: expect.stringMatching(/non-local/) });
    expect(
      interpretCreate(
        { ok: true, slug: 'my-crm', linked: true, started: false, error: 'Too many running' },
        true,
        local
      )
    ).toEqual({ state: 'created', slug: 'my-crm', error: 'Too many running' });
    expect(
      interpretCreate(
        { ok: true, slug: 'my-crm', linked: false, command: 'pnpm install' },
        true,
        local
      )
    ).toMatchObject({ state: 'needs-install', command: 'pnpm install' });
    expect(interpretCreate({ ok: false, error: 'my-crm already exists' }, false, local)).toEqual({
      state: 'failed',
      error: 'my-crm already exists',
    });
  });
});
