import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import axe from 'axe-core';
import { afterEach, describe, expect, it } from 'vitest';
import ThemeBrowser from '../src/components/ThemeBrowser.svelte';
import ThemeSwatch from '../src/components/ThemeSwatch.svelte';
import {
  buildThemeCatalog,
  filterThemeCards,
  type ThemeCardData,
  themeCategories,
  withThemeParam,
} from '../src/lib/theme-catalog.ts';

afterEach(() => cleanup());

describe('theme-catalog helpers', () => {
  it('builds 30+ cards with unique ids and light/dark styles', async () => {
    const cards = await buildThemeCatalog();
    expect(cards.length).toBeGreaterThanOrEqual(30);
    expect(new Set(cards.map((c) => c.id)).size).toBe(cards.length);
    expect(cards.some((c) => c.source === 'builtin' && c.id === 'violet')).toBe(true);
    expect(cards.some((c) => c.source === 'library')).toBe(true);
    for (const card of cards) {
      expect(card.lightStyle).toContain('--py-background:');
      expect(card.lightStyle).toContain('--py-primary:');
      expect(card.darkStyle).toContain('--py-background:');
      expect(card.category.length).toBeGreaterThan(0);
    }
    expect(themeCategories(cards)[0]).toBe('builtin');
  });

  it('filters by category and multi-term query', async () => {
    const cards = await buildThemeCatalog();
    expect(
      filterThemeCards(cards, { category: 'fintech' }).every((c) => c.category === 'fintech')
    ).toBe(true);
    expect(filterThemeCards(cards, { q: 'violet builtin' }).map((c) => c.id)).toContain('violet');
    expect(filterThemeCards(cards, { q: 'zz-no-such-theme' })).toEqual([]);
  });

  it('appends theme and mode query params without dropping the hash', () => {
    expect(withThemeParam('/apps/crm/', 'ocean')).toBe('/apps/crm/?theme=ocean');
    expect(withThemeParam('/apps/crm/?scenario=x', 'ocean', 'dark')).toBe(
      '/apps/crm/?scenario=x&theme=ocean&mode=dark'
    );
    expect(withThemeParam('/apps/crm/#/deals', 'rose')).toBe('/apps/crm/?theme=rose#/deals');
  });
});

function sampleCard(overrides: Partial<ThemeCardData> = {}): ThemeCardData {
  return {
    id: 'ocean',
    name: 'Ocean',
    description: 'Cool slate surfaces and a confident blue.',
    category: 'builtin',
    tags: ['builtin', 'core'],
    source: 'builtin',
    lightStyle:
      '--py-background:#fff;--py-foreground:#111;--py-primary:#2563eb;--py-primary-foreground:#fff;--py-muted-foreground:#52525b;--py-border:#e4e4e7;--py-surface:#fff;--py-surface-foreground:#111;--py-secondary:#f4f4f5;--py-secondary-foreground:#18181b;--py-destructive:#b91c1c;--py-destructive-foreground:#fff;--py-success:#15803d;--py-chart1:#2563eb;--py-chart2:#0ea5e9;--py-radius:0.5rem;--py-font-sans:system-ui;--py-font-heading:system-ui;--py-letter-spacing-body:0;--py-letter-spacing-heading:0;--py-font-weight-heading:600;--py-shadow-soft:none',
    darkStyle:
      '--py-background:#09090b;--py-foreground:#fafafa;--py-primary:#60a5fa;--py-primary-foreground:#0f172a;--py-muted-foreground:#a1a1aa;--py-border:rgb(255 255 255 / 0.1);--py-surface:#18181b;--py-surface-foreground:#fafafa;--py-secondary:#27272a;--py-secondary-foreground:#fafafa;--py-destructive:#f87171;--py-destructive-foreground:#450a0a;--py-success:#4ade80;--py-chart1:#60a5fa;--py-chart2:#22d3ee;--py-radius:0.5rem;--py-font-sans:system-ui;--py-font-heading:system-ui;--py-letter-spacing-body:0;--py-letter-spacing-heading:0;--py-font-weight-heading:600;--py-shadow-soft:none',
    ...overrides,
  };
}

describe('ThemeSwatch', () => {
  it('renders light and dark samples and preview links', () => {
    render(ThemeSwatch, {
      theme: sampleCard(),
      previewUrl: '/apps/crm-demo/',
      previewLabel: 'Try in CRM',
    });
    expect(screen.getByRole('heading', { name: 'Ocean' })).toBeTruthy();
    expect(screen.getByLabelText('Ocean light mode sample')).toBeTruthy();
    expect(screen.getByLabelText('Ocean dark mode sample')).toBeTruthy();
    const light = screen.getByRole('link', { name: 'Try in CRM (light)' });
    const dark = screen.getByRole('link', { name: 'Try in CRM (dark)' });
    expect(light.getAttribute('href')).toBe('/apps/crm-demo/?theme=ocean&mode=light');
    expect(dark.getAttribute('href')).toBe('/apps/crm-demo/?theme=ocean&mode=dark');
  });

  it('is axe-clean in the gallery shell for light and dark document themes', async () => {
    async function checkAxe() {
      const results = await axe.run(document.body, {
        rules: {
          // Unit mounts are not a full page document.
          region: { enabled: false },
          'page-has-heading-one': { enabled: false },
        },
      });
      expect(results.violations).toEqual([]);
    }

    document.documentElement.dataset.theme = 'light';
    const { unmount } = render(ThemeSwatch, {
      theme: sampleCard(),
      previewUrl: '/apps/crm-demo/',
    });
    await checkAxe();
    unmount();

    document.documentElement.dataset.theme = 'dark';
    render(ThemeSwatch, {
      theme: sampleCard({ id: 'fintech-ledger', name: 'Fintech Ledger', category: 'fintech' }),
      previewUrl: '/apps/crm-demo/',
    });
    await checkAxe();
    document.documentElement.dataset.theme = 'light';
  });
});

describe('ThemeBrowser', () => {
  it('filters the grid by category and search', async () => {
    const themes = [
      sampleCard(),
      sampleCard({
        id: 'fintech-ledger',
        name: 'Fintech Ledger',
        category: 'fintech',
        tags: ['finance'],
        source: 'library',
      }),
      sampleCard({
        id: 'gaming-neon',
        name: 'Gaming Neon',
        category: 'gaming',
        tags: ['neon'],
        source: 'library',
      }),
    ];
    render(ThemeBrowser, {
      themes,
      categories: ['builtin', 'fintech', 'gaming'],
      previewUrl: '/apps/crm-demo/',
      previewName: 'CRM Demo',
    });

    expect(screen.getByTestId('theme-count').textContent).toMatch(/Showing 3 of 3/);
    expect(within(screen.getByTestId('theme-grid')).getAllByTestId('theme-swatch')).toHaveLength(3);

    await fireEvent.click(screen.getByRole('button', { name: 'fintech' }));
    expect(screen.getByTestId('theme-count').textContent).toMatch(/Showing 1 of 3/);
    expect(screen.getByRole('heading', { name: 'Fintech Ledger' })).toBeTruthy();

    await fireEvent.input(screen.getByTestId('theme-search'), {
      target: { value: 'neon' },
    });
    // category still fintech → empty
    expect(screen.getByText(/No themes match/)).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await fireEvent.input(screen.getByTestId('theme-search'), {
      target: { value: 'gaming' },
    });
    expect(screen.getByRole('heading', { name: 'Gaming Neon' })).toBeTruthy();
  });

  it('is axe-clean with filters visible', async () => {
    document.documentElement.dataset.theme = 'light';
    render(ThemeBrowser, {
      themes: [sampleCard(), sampleCard({ id: 'rose', name: 'Rose', category: 'builtin' })],
      categories: ['builtin'],
      previewUrl: '/apps/x/',
      previewName: 'Demo',
    });
    const results = await axe.run(document.body, {
      rules: {
        region: { enabled: false },
        'page-has-heading-one': { enabled: false },
      },
    });
    expect(results.violations).toEqual([]);
  });
});
