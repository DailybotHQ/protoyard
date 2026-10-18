import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
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
