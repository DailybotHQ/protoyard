import type { Deck } from '@protoyard/decks/schema';
import { cleanup, render, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { compileDesignSystemDocument } from '../../themes/src/index.ts';
import { DeckApp, deckDesignSystems } from '../src/app/index.ts';
import { deckDesignSystems as rootDeckDesignSystems } from '../src/index.ts';

/** DeckApp host options from PLAN_012: stage messages (UG-09) and design systems (UG-10). */
function deck(): Deck {
  return {
    style: { aspect: '16:9' },
    outline: { title: 'Demo deck', sections: [{ id: 'all', slideIds: ['intro'] }] },
    slides: [
      {
        id: 'intro',
        title: 'Intro',
        layout: 'title-hero',
        props: { title: 'Welcome', subtitle: 'A short talk' },
      },
    ],
  };
}

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

describe('DeckApp messages (UG-09)', () => {
  it('forwards stage message overrides to the stage', async () => {
    const view = render(DeckApp, {
      props: {
        deck: deck(),
        autofocus: false,
        syncHash: false,
        messages: { 'stage.label': 'Presentación: {title}' },
      },
    });
    await waitFor(() =>
      expect(view.container.querySelector('[aria-label="Presentación: Demo deck"]')).toBeTruthy()
    );
    expect(view.container.querySelector('[aria-label="Presentation: Demo deck"]')).toBeNull();
  });
});

describe('DeckApp designSystems (UG-10)', () => {
  it('deckDesignSystems resolves only its own ref, and is on the root entry too', () => {
    const compiled = { id: 'ledger', version: '1.2.0', vars: { light: {} } };
    const systems = deckDesignSystems(compiled, { mode: 'dark' });
    expect(systems.ref).toBe('ledger@1.2.0');
    expect(systems.mode).toBe('dark');
    expect(systems.resolve?.('ledger@1.2.0')).toBe(compiled);
    expect(systems.resolve?.('ledger@1.3.0')).toBeUndefined();
    expect(rootDeckDesignSystems).toBe(deckDesignSystems);
  });

  it('paints the compiled variables on the stage instead of loading the deck theme', async () => {
    const result = await compileDesignSystemDocument({
      format: 'texuli/design-system',
      formatVersion: 1,
      id: 'ledger',
      version: '1.0.0',
      name: 'Ledger',
      color: { brand: { seed: '#7c3aed' } },
    });
    if (!result.ok) throw new Error(result.errors.join('\n'));
    const primary = result.shipped.vars.light?.['--tx-primary'];
    expect(primary).toMatch(/^#[0-9a-f]{6}$/);
    const view = render(DeckApp, {
      props: {
        deck: deck(),
        autofocus: false,
        syncHash: false,
        designSystems: deckDesignSystems(result.shipped),
      },
    });
    const stage = () => view.container.querySelector<HTMLElement>('.tx-deck-stage');
    await waitFor(() => expect(stage()?.style.getPropertyValue('--tx-primary')).toBe(primary), {
      timeout: 10_000,
    });
    // No deck theme was loaded: the style warning banner never shows, and the stage leaves theming to the host.
    expect(view.container.querySelector('[data-py-deck-style-warning]')).toBeNull();
  });
});
