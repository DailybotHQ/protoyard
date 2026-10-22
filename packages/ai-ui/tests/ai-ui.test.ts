import { AI_MODELS } from '@protoyard/ai';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AssistantComposer from '../src/components/AssistantComposer.svelte';
import AssistantWorkspace from '../src/components/AssistantWorkspace.svelte';
import RichAnswer from '../src/components/RichAnswer.svelte';
import type { AssistantConversation } from '../src/types.ts';

afterEach(() => cleanup());

const conversations: AssistantConversation[] = [
  { id: 'chat-a', title: 'Launch plan', updatedAt: '2026-10-17T12:00:00.000Z', pinned: true },
  { id: 'chat-b', title: 'Support reply', updatedAt: '2026-10-16T12:00:00.000Z', folder: 'Work' },
];

describe('AssistantComposer', () => {
  it('submits with the chosen simulated model and preserves the multiline keyboard contract', async () => {
    const onSubmit = vi.fn();
    render(AssistantComposer, { onSubmit });
    const prompt = screen.getByRole('textbox', { name: 'Message the simulated assistant' });
    await fireEvent.input(prompt, { target: { value: 'Draft a launch plan' } });
    await fireEvent.keyDown(prompt, { key: 'Enter', shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
    await fireEvent.keyDown(prompt, { key: 'Enter' });
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        prompt: 'Draft a launch plan',
        model: AI_MODELS[0],
        attachments: [],
      })
    );
    await waitFor(() => expect((prompt as HTMLTextAreaElement).value).toBe(''));
  });

  it('shows a sending state while onSubmit is in flight and never sends twice', async () => {
    let release!: () => void;
    const onSubmit = vi.fn(() => new Promise<void>((r) => (release = r)));
    render(AssistantComposer, { onSubmit });
    const prompt = screen.getByRole('textbox', { name: 'Message the simulated assistant' });
    await fireEvent.input(prompt, { target: { value: 'Draft a launch plan' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    const sending = await screen.findByRole('button', { name: 'Sending message' });
    expect(sending.getAttribute('aria-busy')).toBe('true');
    expect((sending as HTMLButtonElement).disabled).toBe(true);
    expect(sending.querySelector('[data-composer-sending]')).not.toBeNull();
    await fireEvent.keyDown(prompt, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    release();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Sending message' })).toBeNull()
    );
  });

  it('offers slash commands and inserts the selected command without submitting', async () => {
    const onSubmit = vi.fn();
    render(AssistantComposer, { onSubmit, slashCommands: ['/summarize', '/search'] });
    const prompt = screen.getByRole('textbox', { name: 'Message the simulated assistant' });
    await fireEvent.input(prompt, { target: { value: '/sum' } });
    await fireEvent.click(screen.getByRole('option', { name: '/summarize' }));
    expect((prompt as HTMLTextAreaElement).value).toBe('/summarize ');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('supports mentions, selected files, and stopping with Escape', async () => {
    const onSubmit = vi.fn();
    const onStop = vi.fn();
    const file = new File(['brief'], 'brief.txt', { type: 'text/plain' });
    render(AssistantComposer, {
      onSubmit,
      onStop,
      mentions: [{ id: 'alex', label: 'Alex Example' }],
    });
    const prompt = screen.getByRole('textbox', { name: 'Message the simulated assistant' });
    await fireEvent.input(prompt, { target: { value: '@Alex' } });
    await fireEvent.click(screen.getByRole('option', { name: '@Alex Example' }));
    expect((prompt as HTMLTextAreaElement).value).toBe('@Alex Example ');
    await fireEvent.input(prompt, { target: { value: 'Review this file' } });
    await fireEvent.change(screen.getByLabelText('Choose attachments'), {
      target: { files: [file] },
    });
    expect(screen.getByText('brief.txt')).toBeTruthy();
    await fireEvent.keyDown(prompt, { key: 'Enter' });
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        prompt: 'Review this file',
        model: AI_MODELS[0],
        attachments: [file],
      })
    );

    cleanup();
    render(AssistantComposer, { onSubmit, onStop, streaming: true });
    await fireEvent.keyDown(
      screen.getByRole('textbox', { name: 'Message the simulated assistant' }),
      { key: 'Escape' }
    );
    expect(onStop).toHaveBeenCalledTimes(1);
  });
});

describe('AssistantWorkspace', () => {
  it('has no axe violations in the empty workspace and composer', async () => {
    const { container } = render(AssistantWorkspace, {
      conversations,
      messages: [],
      selectedConversationId: 'chat-a',
      onSend: vi.fn(),
    });
    const results = await axe.run(container);
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });

  it('searches history and keeps actions available by accessible names', async () => {
    const onSelectConversation = vi.fn();
    const onTogglePin = vi.fn();
    render(AssistantWorkspace, {
      conversations,
      messages: [],
      selectedConversationId: 'chat-a',
      folders: ['Work'],
      onSend: vi.fn(),
      onSelectConversation,
      onTogglePin,
    });
    expect(screen.getByRole('heading', { name: 'What would you like to explore?' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create folder' }).hasAttribute('disabled')).toBe(
      true
    );
    const search = screen.getByRole('textbox', { name: 'Search conversations' });
    await fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(document.activeElement).toBe(search);
    await fireEvent.input(search, { target: { value: 'Support' } });
    expect(screen.getByRole('button', { name: /Support reply/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Launch plan/ })).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: /Support reply/ }));
    expect(onSelectConversation).toHaveBeenCalledWith('chat-b');
    expect(screen.queryByRole('button', { name: 'Create share link' })).toBeNull();
  });

  it('lets the parent provide a real share URL and exposes it for copying', async () => {
    render(AssistantWorkspace, {
      conversations,
      messages: [],
      selectedConversationId: 'chat-a',
      onSend: vi.fn(),
      onShare: vi.fn().mockResolvedValue('https://example.com/share/chat-a'),
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Create share link' }));
    expect(await screen.findByRole('textbox', { name: 'Share link' })).toBeTruthy();
    expect((screen.getByRole('textbox', { name: 'Share link' }) as HTMLInputElement).value).toBe(
      'https://example.com/share/chat-a'
    );
  });

  it('renders a bounded, virtualized window of a long thread', async () => {
    const messages = Array.from({ length: 150 }, (_, index) => ({
      id: `message-${index}`,
      role: index % 2 ? ('assistant' as const) : ('user' as const),
      content: `Earlier item ${index}`,
      createdAt: '2026-10-17T12:00:00.000Z',
    }));
    render(AssistantWorkspace, {
      conversations,
      messages,
      selectedConversationId: 'chat-a',
      onSend: vi.fn(),
    });
    // MessageList virtualizes long threads (T-ai-virtual-thread): only a window of rows is in the DOM.
    const rendered = screen.queryAllByText(/^Earlier item \d+$/);
    expect(rendered.length).toBeGreaterThan(0);
    expect(rendered.length).toBeLessThan(messages.length);
  });
});

describe('RichAnswer', () => {
  it('renders markdown as safe elements and leaves executable markup as text', () => {
    const { container } = render(RichAnswer, {
      content:
        '# Plan\n\n**Ready** <script>alert(1)</script> [unsafe](javascript:alert(1)) ![Cover](assets/cover.webp)',
    });
    expect(screen.getByRole('heading', { name: 'Plan' })).toBeTruthy();
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('<script>alert(1)</script>');
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(container.querySelector('img')?.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(container.querySelector('strong')?.textContent).toBe('Ready');
  });
});
