import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AssistantWidget from '../src/widget/AssistantWidget.svelte';
import AssistantWidgetPanel from '../src/widget/AssistantWidgetPanel.svelte';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

const props = {
  prototypeId: 'support-demo',
  conversations: [{ id: 'chat-a', title: 'Support', updatedAt: '2026-10-17T12:00:00.000Z' }],
  messages: [],
  selectedConversationId: 'chat-a',
  onSend: vi.fn(),
};

describe('AssistantWidget', () => {
  it('loads the conversation panel lazily and collapses one mode per Escape', async () => {
    const { container } = render(AssistantWidget, props);
    expect(AssistantWidgetPanel).toBeTruthy();
    expect(container.querySelector('[data-widget-panel]')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Open simulated assistant' }));
    expect(
      await screen.findByRole('textbox', { name: 'Message the simulated assistant' })
    ).toBeTruthy();
    expect(container.querySelector('[data-widget-mode]')?.getAttribute('data-widget-mode')).toBe(
      'sidebar'
    );

    await fireEvent.click(screen.getByRole('button', { name: 'Expand assistant to full screen' }));
    expect(container.querySelector('[data-widget-panel]')?.getAttribute('aria-modal')).toBe('true');
    await fireEvent.keyDown(container.querySelector('[data-widget-panel]') as HTMLElement, {
      key: 'Escape',
    });
    expect(container.querySelector('[data-widget-mode]')?.getAttribute('data-widget-mode')).toBe(
      'sidebar'
    );
    await fireEvent.keyDown(container.querySelector('[data-widget-panel]') as HTMLElement, {
      key: 'Escape',
    });
    expect(container.querySelector('[data-widget-mode]')?.getAttribute('data-widget-mode')).toBe(
      'launcher'
    );
    expect(container.querySelector('[data-widget-panel]')).toBeTruthy();
  });

  it('persists mode per prototype and keeps the composer draft mounted while collapsed', async () => {
    const { container, unmount } = render(AssistantWidget, props);
    await fireEvent.click(screen.getByRole('button', { name: 'Open simulated assistant' }));
    const prompt = await screen.findByRole('textbox', { name: 'Message the simulated assistant' });
    await fireEvent.input(prompt, { target: { value: 'Keep this draft' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Close assistant' }));
    expect((container.querySelector('#assistant-prompt') as HTMLTextAreaElement).value).toBe(
      'Keep this draft'
    );
    expect(window.localStorage.getItem('protoyard:ai-widget-mode:support-demo')).toBe('launcher');
    unmount();

    window.localStorage.setItem('protoyard:ai-widget-mode:support-demo', 'fullscreen');
    const second = render(AssistantWidget, { ...props, prototypeId: 'other-prototype' });
    await waitFor(() =>
      expect(
        second.container.querySelector('[data-widget-mode]')?.getAttribute('data-widget-mode')
      ).toBe('launcher')
    );
    expect(window.localStorage.getItem('protoyard:ai-widget-mode:other-prototype')).toBeNull();
  });

  it('restores a saved sidebar mode and enables a focus trap in full screen', async () => {
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue({
      length: 1,
      item: () => null,
      [Symbol.iterator]: function* () {
        yield new DOMRect();
      },
    } as DOMRectList);
    window.localStorage.setItem('protoyard:ai-widget-mode:support-demo', 'sidebar');
    render(AssistantWidget, props);
    expect(
      await screen.findByRole('textbox', { name: 'Message the simulated assistant' })
    ).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Expand assistant to full screen' }));
    const panel = screen.getByRole('dialog', { name: 'Simulated assistant' });
    const close = panel.querySelector<HTMLElement>('[data-widget-close]');
    expect(close).toBeTruthy();
    const focusable = panel.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    const last = focusable.item(focusable.length - 1);
    last.focus();
    await fireEvent.keyDown(panel, { key: 'Tab' });
    expect(document.activeElement).toBe(panel.querySelector('header button'));
  });
});

describe('AssistantWidget sidebar layout', () => {
  // happy-dom applies no stylesheet, so this pins the layout contract: every layout
  // switch in the workspace follows its own width (container queries), never the
  // window. A 28rem sidebar on a wide window used to get the two-column desktop
  // layout (`lg:`), squeezing the chat column to a few words per line.
  it('uses container queries, not viewport breakpoints, in the panel workspace', async () => {
    const { readFileSync } = await import('node:fs');
    const viewportBreakpoint = /(?<![\w@-])(sm|md|lg|xl|2xl):/;
    for (const file of [
      '../src/components/AssistantWorkspace.svelte',
      '../src/components/AssistantComposer.svelte',
      '../src/MessageList.svelte',
    ]) {
      const markup = readFileSync(new URL(file, import.meta.url), 'utf8')
        .split('</script>')
        .at(-1);
      expect(markup?.match(viewportBreakpoint)?.[0], file).toBeUndefined();
      // Overlays stay inside the panel instead of covering the host page.
      expect(markup, file).not.toMatch(/\bfixed inset-0\b|\d+vw\b/);
    }
  });

  it('opens single-column in sidebar mode: chat and composer, history behind a toggle', async () => {
    const { container } = render(AssistantWidget, props);
    await fireEvent.click(screen.getByRole('button', { name: 'Open simulated assistant' }));
    const prompt = await screen.findByRole('textbox', { name: 'Message the simulated assistant' });
    const root = container.querySelector('[data-widget-panel] .\\@container');
    expect(root, 'workspace is a size container').toBeTruthy();
    // The panel, not the workspace's 32rem page minimum, sets the height.
    expect(root?.parentElement?.className).toContain('*:min-h-0');
    const history = screen.getByRole('complementary', { name: 'Conversation history' });
    // Off-canvas until the wide (@3xl) layout or the history toggle shows it.
    expect(history.className).toMatch(/-translate-x-full/);
    expect(history.className).toMatch(/@3xl:static/);
    const toggle = screen.getByRole('button', { name: 'Open conversation history' });
    expect(toggle.className).toMatch(/@3xl:hidden/);
    await fireEvent.click(toggle);
    expect(history.className).toMatch(/(^|\s)translate-x-0/);
    await fireEvent.click(
      within(history).getByRole('button', { name: 'Close conversation navigation' })
    );
    expect(history.className).toMatch(/-translate-x-full/);
    expect(prompt.isConnected).toBe(true);
  });
});
