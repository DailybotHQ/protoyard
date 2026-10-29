import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import axe from 'axe-core';
import { afterEach, describe, expect, it } from 'vitest';
import ThemeExplorer from '../src/components/ThemeExplorer.svelte';
import {
  buildThemeCatalog,
  filterThemeCards,
  type ThemeCardData,
} from '../src/lib/theme-catalog.ts';

afterEach(() => {
  cleanup();
  document.querySelectorAll('[data-theme-card]').forEach((card) => {
    card.remove();
  });
  window.history.replaceState(null, '', '/themes/');
});

function addStaticCards() {
  document.body.insertAdjacentHTML(
    'beforeend',
    `<ul data-testid="theme-grid">
      <li data-theme-card data-theme-id="health-clinic" data-collection="industry" data-moods="calm fresh" data-search="health-clinic health clinic industry calm fresh medical green">
        <div data-theme-mode="light"></div><div data-theme-mode="dark" hidden></div>
        <a data-theme-open href="/p/crm-demo/?theme=health-clinic&mode=light">Open CRM Demo in this theme</a>
      </li>
      <li data-theme-card data-theme-id="gaming-neon" data-collection="brand-like" data-moods="bold playful" data-search="gaming-neon gaming neon brand-like bold playful">
        <div data-theme-mode="light"></div><div data-theme-mode="dark" hidden></div>
        <a data-theme-open href="/p/crm-demo/?theme=gaming-neon&mode=light">Open CRM Demo in this theme</a>
      </li>
    </ul>`
  );
}

describe('ThemeExplorer', () => {
  it('filters static cards by search, collection, and mood and syncs filters to the URL', async () => {
    addStaticCards();
    window.history.replaceState(null, '', '/themes/?collection=industry&mood=calm');
    render(ThemeExplorer, {
      collections: ['industry', 'brand-like'],
      moods: ['bold', 'calm', 'fresh', 'playful'],
      prototypes: [{ slug: 'crm-demo', name: 'CRM Demo', url: '/p/crm-demo/' }],
      themeCount: 2,
    });

    await waitFor(() =>
      expect(screen.getByTestId('theme-count').textContent).toContain('Showing 1 of 2')
    );
    expect(screen.getByTestId('theme-collection').textContent).toContain('industry');
    expect(screen.getByTestId('theme-mood').textContent).toContain('calm');

    await fireEvent.input(screen.getByTestId('theme-search'), { target: { value: 'clinic' } });
    await waitFor(() =>
      expect(screen.getByTestId('theme-count').textContent).toContain('Showing 1 of 2')
    );
    expect(window.location.search).toContain('q=clinic');

    await fireEvent.click(screen.getByTestId('theme-collection'));
    await fireEvent.click(await screen.findByText('brand-like'));
    await waitFor(() =>
      expect(screen.getByTestId('theme-count').textContent).toContain('Showing 0 of 2')
    );
    expect(window.location.search).toContain('collection=brand-like');
  });

  it('switches all previews and the prototype link to the selected mode', async () => {
    addStaticCards();
    render(ThemeExplorer, {
      collections: ['industry', 'brand-like'],
      moods: ['bold', 'calm', 'fresh', 'playful'],
      prototypes: [{ slug: 'crm-demo', name: 'CRM Demo', url: '/p/crm-demo/' }],
      themeCount: 2,
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Dark' }));
    expect(screen.getByRole('button', { name: 'Dark' }).getAttribute('aria-pressed')).toBe('true');
    await waitFor(() =>
      expect(
        document.querySelector<HTMLElement>(
          '[data-theme-card][data-theme-id="health-clinic"] [data-theme-mode="dark"]'
        )?.hidden
      ).toBe(false)
    );
    expect(
      document.querySelector<HTMLElement>(
        '[data-theme-card][data-theme-id="health-clinic"] [data-theme-mode="light"]'
      )?.hidden
    ).toBe(true);
    expect(
      document.querySelector<HTMLAnchorElement>('[data-theme-id="health-clinic"] [data-theme-open]')
        ?.href
    ).toContain('theme=health-clinic&mode=dark');
    expect(window.location.search).toContain('mode=dark');
  });

  it('has no axe violations with the explorer controls and cards present', async () => {
    addStaticCards();
    render(ThemeExplorer, {
      collections: ['industry', 'brand-like'],
      moods: ['bold', 'calm', 'fresh', 'playful'],
      prototypes: [{ slug: 'crm-demo', name: 'CRM Demo', url: '/p/crm-demo/' }],
      themeCount: 2,
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

describe('theme explorer catalog data', () => {
  it('includes collection, mood, and precomputed chart colors in static cards', async () => {
    const themes = await buildThemeCatalog();
    const health = themes.find((theme) => theme.id === 'health-clinic');
    expect(health?.collection).toBe('industry');
    expect(health?.mood).toContain('calm');
    expect(health?.chartColors.length).toBeGreaterThanOrEqual(5);
    expect(filterThemeCards(themes, { collection: 'colorblind-safe' }).length).toBeGreaterThan(0);
    expect(
      filterThemeCards(themes, { mood: 'playful' }).every((theme) => theme.mood.includes('playful'))
    ).toBe(true);
  });

  it('exposes serializable palette styles and chart colors without requiring runtime theme code', async () => {
    const themes = await buildThemeCatalog();
    const card = themes.find((theme) => theme.id === 'violet') as ThemeCardData;
    expect(card.lightStyle).toContain('--tx-background:');
    expect(card.darkStyle).toContain('--tx-background:');
    expect(card.chartColors.every((color) => color.startsWith('#'))).toBe(true);
  });
});
