import { DECK_CONTROLS } from '@protoyard/decks';
import type { DeckSlide } from '@protoyard/decks/schema';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DeckToolbar from '../src/chrome/DeckToolbar.svelte';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const slides: DeckSlide[] = [
  { id: 'intro', title: 'Welcome', layout: 'title-hero', props: { title: 'Welcome' } },
  { id: 'metrics', title: 'Quarterly metrics', layout: 'free', blocks: [] },
  { id: 'close', title: 'Next steps', layout: 'free', blocks: [] },
];

function renderToolbar(overrides: Record<string, unknown> = {}) {
  const onaction = vi.fn();
  const onjump = vi.fn();
  render(DeckToolbar, {
    props: {
      reference: () => 'Welcome · intro · #/intro/0',
      slides,
      currentOrdinal: 1,
      onaction,
      onjump,
      ...overrides,
    },
  });
  return { onaction, onjump };
}

describe('DeckToolbar', () => {
  it('renders registry controls in display groups with icons and stable names', () => {
    renderToolbar();
    const toolbar = screen.getByRole('toolbar', { name: 'Deck controls' });
    expect(within(toolbar).getByRole('button', { name: /Choose a slide/ }).textContent).toContain(
      '1 / 3'
    );
    for (const control of DECK_CONTROLS.filter(
      (item) => !['debug', 'fullscreen-exit'].includes(item.action)
    )) {
      const id = control.action === 'copy-link' ? 'copy-reference' : control.action;
      const button = toolbar.querySelector(`[data-py-deck-tool="${id}"]`);
      expect(button, `${control.action} is rendered`).not.toBeNull();
      expect(button?.getAttribute('aria-label')).toContain(control.label);
      expect(button?.querySelector('svg')).not.toBeNull();
    }
    expect(toolbar.querySelector('[data-py-deck-tool="debug"]')).toBeNull();
    expect(toolbar.querySelector('[data-py-deck-control-group="navigate"]')).not.toBeNull();
    expect(toolbar.querySelector('[data-py-deck-control-group="view"]')).not.toBeNull();
  });

  it('attaches the registry tooltip to every available control', async () => {
    renderToolbar();
    for (const control of DECK_CONTROLS.filter(
      (item) =>
        item.available({
          fullscreen: true,
          popup: true,
          clipboard: true,
          print: true,
          debug: false,
        }) && item.action !== 'fullscreen-exit'
    )) {
      const id = control.action === 'copy-link' ? 'copy-reference' : control.action;
      const button = document.querySelector<HTMLButtonElement>(`[data-py-deck-tool="${id}"]`);
      expect(button).not.toBeNull();
      button?.focus();
      const tooltip = await screen.findByRole('tooltip');
      expect(tooltip.textContent).toContain(control.description);
      expect(button?.getAttribute('aria-describedby')).toBe(tooltip.id);
      button?.blur();
      await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
    }
  });

  it('opens the slide list on Enter, navigates from a selected title and restores focus', async () => {
    const { onjump } = renderToolbar();
    const trigger = screen.getByRole('button', { name: /Choose a slide/ });
    trigger.focus();
    await fireEvent.keyDown(trigger, { key: 'Enter' });
    const list = await screen.findByRole('listbox', { name: 'Choose a slide' });
    expect(
      within(list)
        .getAllByRole('option')
        .map((option) => option.textContent)
    ).toEqual(['1.Welcome', '2.Quarterly metrics', '3.Next steps']);
    await fireEvent.click(within(list).getByRole('option', { name: /Quarterly metrics/ }));
    expect(onjump).toHaveBeenCalledWith('metrics');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('moves focus through the slide list with the keyboard and closes it on Escape', async () => {
    const { onjump } = renderToolbar({ currentOrdinal: 2 });
    const trigger = screen.getByRole('button', { name: /Choose a slide/ });
    trigger.focus();
    await fireEvent.keyDown(trigger, { key: 'Enter' });
    const list = await screen.findByRole('listbox', { name: 'Choose a slide' });
    const options = within(list).getAllByRole('option');
    // Focus starts on the current slide, the only option in the Tab order.
    await waitFor(() => expect(document.activeElement).toBe(options[1]));
    expect(options.map((option) => option.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);
    const deckKeys = vi.fn();
    document.body.addEventListener('keydown', deckKeys);
    try {
      for (const [key, focused] of [
        ['ArrowDown', 2],
        ['ArrowDown', 2],
        ['Home', 0],
        ['ArrowUp', 0],
        ['End', 2],
        ['ArrowUp', 1],
      ] as const) {
        await fireEvent.keyDown(document.activeElement as HTMLElement, { key });
        expect(document.activeElement, key).toBe(options[focused]);
      }
      await fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' });
      // The list's keys are its own: the deck never turns them into navigation.
      expect(deckKeys).not.toHaveBeenCalled();
    } finally {
      document.body.removeEventListener('keydown', deckKeys);
    }
    expect(screen.queryByRole('listbox')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(onjump).not.toHaveBeenCalled();
  });

  it('hides the tooltip of a control once it is pressed', async () => {
    renderToolbar();
    const trigger = screen.getByRole('button', { name: /Choose a slide/ });
    trigger.focus();
    expect(await screen.findByRole('tooltip')).toBeTruthy();
    await fireEvent.click(trigger);
    await screen.findByRole('listbox', { name: 'Choose a slide' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('dispatches navigation and toggles from registry controls', async () => {
    const { onaction } = renderToolbar();
    await fireEvent.click(screen.getByRole('button', { name: 'Next step or slide' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Overview of all slides' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Presenter view' }));
    expect(onaction.mock.calls).toEqual([['next'], ['overview'], ['presenter']]);
    expect(
      screen.getByRole('button', { name: 'Overview of all slides' }).getAttribute('aria-pressed')
    ).toBe('false');
  });

  it('filters unavailable controls and folds secondary controls into More on narrow screens', async () => {
    const matchMedia = vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      media: '(max-width: 639px)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList);
    renderToolbar({
      environment: {
        fullscreen: false,
        popup: false,
        clipboard: true,
        print: false,
        debug: false,
      },
    });
    expect(screen.queryByRole('button', { name: 'Full screen' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Print, one slide per page' })).toBeNull();
    const more = (await screen.findByText('More')).closest('details');
    expect(more).not.toBeNull();
    expect(
      within(more as HTMLElement).getByRole('button', { name: 'Presenter view' })
    ).toBeTruthy();
    // Escape closes the open menu and gives focus back to More, before the deck sees it.
    const menu = more as HTMLDetailsElement;
    menu.open = true;
    const deckKeys = vi.fn();
    document.body.addEventListener('keydown', deckKeys);
    await fireEvent.keyDown(within(menu).getByRole('button', { name: 'Presenter view' }), {
      key: 'Escape',
    });
    document.body.removeEventListener('keydown', deckKeys);
    expect(menu.open).toBe(false);
    expect(document.activeElement).toBe(menu.querySelector('summary'));
    expect(deckKeys).not.toHaveBeenCalled();

    // Choosing an item closes the menu, so the next Escape reaches what it opened.
    menu.open = true;
    const presenter = within(menu).getByRole('button', { name: 'Presenter view' });
    presenter.focus();
    await fireEvent.click(presenter);
    await waitFor(() => expect(menu.open).toBe(false));
    expect(document.activeElement).toBe(menu.querySelector('summary'));
    expect(matchMedia).toHaveBeenCalledWith('(max-width: 639px)');
    matchMedia.mockRestore();
  });
});
