import { THEME_COLLECTIONS, THEME_LIBRARY_META } from '@protoyard/themes';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import MarketCard from '../src/components/marketplace/MarketCard.svelte';
import MarketplaceBrowser from '../src/components/marketplace/MarketplaceBrowser.svelte';
import {
  EMPTY_QUERY,
  facets,
  filterMarket,
  type MarketEntry,
  type MarketSource,
  paramsFromQuery,
  queryFromParams,
  toMarketEntry,
  tryThemeHref,
  tryThemes,
  withThemeParam,
} from '../src/components/marketplace/model';
import { marketTheme, themeChoices } from '../src/components/marketplace/theme-facet';

afterEach(() => cleanup());

const LEDGER = THEME_LIBRARY_META.find((meta) => meta.id === 'fintech-ledger');

function source(slug: string, kind = 'prototype'): MarketSource {
  return {
    kind,
    slug,
    name: slug.replace(/-/g, ' '),
    description: `The ${slug} demo.`,
    icon: null,
    scenarioCount: 2,
    catalog: { category: 'sales', platforms: ['web'], shell: 'none', features: [] },
  };
}

const card = (slug: string, theme: string, kind = 'prototype') =>
  toMarketEntry(source(slug, kind), null, marketTheme(theme)) as MarketEntry;

const shelf = [
  card('crm-demo', 'violet'),
  card('ledger-demo', 'fintech-ledger'),
  card('brand-demo', 'acme-teal'),
  card('contrast-demo', 'accessible-high-contrast'),
];

describe('default theme mapping (build time)', () => {
  it('maps library ids to their metadata, built-ins to their primaries, the rest to custom', () => {
    expect(marketTheme('fintech-ledger')).toEqual({
      i: 'fintech-ledger',
      n: LEDGER?.name,
      c: LEDGER?.collection,
      s: [LEDGER?.seed, LEDGER?.secondary],
    });
    const violet = marketTheme('violet');
    expect(violet).toMatchObject({ i: 'violet', n: 'Violet', c: 'builtin' });
    expect(violet?.s).toHaveLength(2);
    expect(marketTheme('acme-teal')).toEqual({
      i: 'acme-teal',
      n: 'acme-teal',
      c: 'custom',
      s: [],
    });
    expect(marketTheme(undefined)).toBeNull();
  });

  it('offers one try-in-theme choice per library collection, minus the card default', () => {
    const choices = themeChoices();
    expect(choices.map((theme) => theme.c)).toEqual(
      THEME_COLLECTIONS.filter((c) => THEME_LIBRARY_META.some((meta) => meta.collection === c))
    );
    const first = choices[0] as NonNullable<(typeof choices)[0]>;
    const own = card('x', first.i);
    expect(tryThemes(choices, own).map((t) => t.i)).not.toContain(first.i);
    expect(tryThemes(choices, own)).toHaveLength(choices.length - 1);
  });
});

describe('collection facet', () => {
  it('counts and filters by the default theme collection, also by theme name in search', () => {
    const f = facets(shelf);
    expect(f.collection).toContainEqual(['builtin', 1]);
    expect(f.collection).toContainEqual(['custom', 1]);
    const slugs = (q: Partial<typeof EMPTY_QUERY>) =>
      filterMarket(shelf, { ...EMPTY_QUERY, ...q }).map((e) => e.s);
    expect(slugs({ collection: 'high-contrast' })).toEqual(['contrast-demo']);
    expect(slugs({ collection: 'custom' })).toEqual(['brand-demo']);
    expect(slugs({ q: 'fintech ledger' })).toEqual(['ledger-demo']);
  });

  it('round-trips collection in the URL and rejects malformed values', () => {
    const query = { ...EMPTY_QUERY, collection: 'high-contrast' };
    expect(paramsFromQuery(query)).toBe('?collection=high-contrast');
    expect(queryFromParams(new URLSearchParams('collection=high-contrast'))).toEqual(query);
    expect(queryFromParams(new URLSearchParams('collection=%3Cscript%3E')).collection).toBe('');
  });
});

describe('theme links', () => {
  it('builds try-in-theme links and sets ?theme= on demo URLs, keeping query and hash', () => {
    expect(tryThemeHref({ k: 'template', s: 'crm-app' }, 'gaming-neon')).toBe(
      '/marketplace/template/crm-app/?theme=gaming-neon'
    );
    expect(withThemeParam('/p/crm/app/', 'ocean')).toBe('/p/crm/app/?theme=ocean');
    expect(withThemeParam('/p/crm/app/?scenario=busy#/deals', 'ocean')).toBe(
      '/p/crm/app/?scenario=busy&theme=ocean#/deals'
    );
    expect(withThemeParam('http://localhost:4500/?theme=violet', 'ocean')).toBe(
      'http://localhost:4500/?theme=ocean'
    );
    expect(withThemeParam('/p/crm/', 'Bad Id"')).toBe('/p/crm/');
  });
});

describe('MarketCard', () => {
  it('shows the default theme swatch and a try-in-theme list of real links', async () => {
    const choices = themeChoices();
    render(MarketCard, {
      props: { entry: card('ledger-demo', 'fintech-ledger'), themes: choices },
    });
    expect(screen.getByTestId('market-theme').textContent).toContain(LEDGER?.name);
    const details = screen.getByTestId('market-try-theme');
    await fireEvent.click(within(details).getByText('Try in theme'));
    const list = within(details).getByRole('list', { name: 'Open ledger demo in another theme' });
    const links = within(list).getAllByRole('link');
    const other = choices.find((theme) => theme.i !== 'fintech-ledger') as (typeof choices)[0];
    expect(links[0]?.getAttribute('href')).toBe(
      `/marketplace/prototype/ledger-demo/?theme=${other?.i}`
    );
    expect(links.at(-1)?.getAttribute('href')).toBe('/themes/');
  });

  it('offers no try-in-theme list for blueprints (no running app)', () => {
    render(MarketCard, {
      props: { entry: card('booking', 'acme-teal', 'blueprint'), themes: themeChoices() },
    });
    expect(screen.queryByTestId('market-try-theme')).toBeNull();
    expect(screen.getByTestId('market-theme').textContent).toContain('acme-teal');
  });
});

describe('MarketplaceBrowser', () => {
  it('filters by theme collection from the Theme select', async () => {
    render(MarketplaceBrowser, {
      props: { entries: shelf, facets: facets(shelf), themes: themeChoices() },
    });
    const select = screen.getByTestId('market-collection') as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toContain('high-contrast');
    await fireEvent.change(select, { target: { value: 'high-contrast' } });
    const results = await screen.findByTestId('market-results');
    expect(
      within(results)
        .getAllByTestId('market-card')
        .map((c) => c.dataset.slug)
    ).toEqual(['contrast-demo']);
  });
});
