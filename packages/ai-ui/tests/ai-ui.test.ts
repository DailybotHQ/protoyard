import { AI_MODELS } from '@protoyard/ai';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AssistantComposer from '../src/components/AssistantComposer.svelte';
import AssistantWorkspace from '../src/components/AssistantWorkspace.svelte';
import RichAnswer from '../src/components/RichAnswer.svelte';
import MessageList from '../src/MessageList.svelte';
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
    await fireEvent.click(screen.getByRole('button', { name: 'Stop response' }));
    expect(onStop).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('button', { name: 'Send message' })).toBeNull();
  });

  it('Enter picks the highlighted suggestion instead of sending, and the arrows move it', async () => {
    const onSubmit = vi.fn();
    render(AssistantComposer, { onSubmit, slashCommands: ['/summarize', '/search'] });
    const prompt = screen.getByRole('textbox', { name: 'Message the simulated assistant' });
    await fireEvent.input(prompt, { target: { value: '/s' } });
    await fireEvent.keyDown(prompt, { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: '/search' }).getAttribute('aria-selected')).toBe(
      'true'
    );
    await fireEvent.keyDown(prompt, { key: 'Enter' });
    expect((prompt as HTMLTextAreaElement).value).toBe('/search ');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('keeps the draft and the attachments when onSubmit returns false, and shows the error on reject', async () => {
    const file = new File(['brief'], 'brief.txt', { type: 'text/plain' });
    const onSubmit = vi.fn().mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('x'));
    render(AssistantComposer, { onSubmit });
    const prompt = screen.getByRole('textbox', { name: 'Message the simulated assistant' });
    await fireEvent.input(prompt, { target: { value: 'Keep me' } });
    await fireEvent.change(screen.getByLabelText('Choose attachments'), {
      target: { files: [file] },
    });
    await fireEvent.keyDown(prompt, { key: 'Enter' });
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect((prompt as HTMLTextAreaElement).value).toBe('Keep me');
    expect(screen.getByText('brief.txt')).toBeTruthy();
    await fireEvent.keyDown(prompt, { key: 'Enter' });
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'The message could not be sent. Your draft is still here.'
    );
    expect((prompt as HTMLTextAreaElement).value).toBe('Keep me');
  });
});

describe('AssistantComposer attachments', () => {
  it('the Attach files button opens the named file picker', async () => {
    render(AssistantComposer, { onSubmit: vi.fn() });
    const picker = screen.getByLabelText('Choose attachments') as HTMLInputElement;
    expect(picker.type).toBe('file');
    expect(picker.multiple).toBe(true);
    const click = vi.spyOn(picker, 'click').mockImplementation(() => {});
    await fireEvent.click(screen.getByRole('button', { name: 'Attach files' }));
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('removes a chosen file with its Tag remove control', async () => {
    const file = new File(['brief'], 'brief.txt', { type: 'text/plain' });
    render(AssistantComposer, { onSubmit: vi.fn() });
    await fireEvent.change(screen.getByLabelText('Choose attachments'), {
      target: { files: [file] },
    });
    expect(screen.getByText('brief.txt')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Remove brief.txt' }));
    await waitFor(() => expect(screen.queryByText('brief.txt')).toBeNull());
  });
});

describe('MessageList', () => {
  const thread = [
    {
      id: 'u1',
      role: 'user' as const,
      content: 'Plan the launch',
      createdAt: '2026-10-17T12:00:00.000Z',
    },
    {
      id: 'a1',
      role: 'assistant' as const,
      content: '**Step one**: pick a date.',
      createdAt: '2026-10-17T12:01:00.000Z',
      branchIndex: 0,
      branchCount: 2,
    },
  ];

  it('renders each message as a Texuli chat message with the simulated marker', () => {
    render(MessageList, { messages: thread, conversationId: 'c1' });
    const log = screen.getByRole('log', { name: 'Conversation messages' });
    expect(log.hasAttribute('data-tx-chat-message-list')).toBe(true);
    expect(screen.getByRole('article', { name: 'Your message' }).textContent).toContain(
      'Plan the launch'
    );
    const agent = screen.getByRole('article', { name: 'Assistant message' });
    expect(agent.textContent).toContain('Simulated');
    expect(agent.querySelector('strong')?.textContent).toBe('Step one');
  });

  it('keeps feedback, branches and edit-and-resend', async () => {
    const onFeedback = vi.fn();
    const onBranchChange = vi.fn();
    const onEditMessage = vi.fn();
    render(MessageList, {
      messages: thread,
      conversationId: 'c1',
      onFeedback,
      onBranchChange,
      onEditMessage,
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Helpful response' }));
    expect(onFeedback).toHaveBeenCalledWith('a1', 'up');
    expect(
      (screen.getByRole('button', { name: 'Previous response version' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    await fireEvent.click(screen.getByRole('button', { name: 'Next response version' }));
    expect(onBranchChange).toHaveBeenCalledWith('a1', 1);
    await fireEvent.click(screen.getByRole('button', { name: 'Edit your message' }));
    const editor = screen.getByRole('textbox', { name: 'Edit your message' });
    await fireEvent.input(editor, { target: { value: 'Plan the beta launch' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Save and resend' }));
    await waitFor(() => expect(onEditMessage).toHaveBeenCalledWith('u1', 'Plan the beta launch'));
  });

  it('marks the last reply as writing while streaming, with its actions held back', () => {
    render(MessageList, {
      messages: thread,
      conversationId: 'c1',
      streaming: true,
      onFeedback: vi.fn(),
      onRegenerate: vi.fn(),
    });
    expect(screen.getByText('Writing…')).toBeTruthy();
    expect(screen.getByText('Writing a reply…')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Helpful response' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Regenerate response' })).toBeNull();
  });

  it('offers no edit control without onEditMessage', () => {
    render(MessageList, { messages: thread, conversationId: 'c1' });
    expect(screen.queryByRole('button', { name: 'Edit your message' })).toBeNull();
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
    // Anchored: each row also has an "Actions for <title>" menu button.
    expect(screen.getByRole('button', { name: /^Support reply/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Launch plan/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Actions for Support reply' })).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: /^Support reply/ }));
    expect(onSelectConversation).toHaveBeenCalledWith('chat-b');
    expect(screen.queryByRole('button', { name: 'Create share link' })).toBeNull();
  });

  it('runs conversation actions from the Texuli menu', async () => {
    const onTogglePin = vi.fn();
    render(AssistantWorkspace, {
      conversations,
      messages: [],
      selectedConversationId: 'chat-a',
      onSend: vi.fn(),
      onTogglePin,
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Actions for Support reply' }));
    await fireEvent.click(await screen.findByRole('menuitem', { name: 'Pin conversation' }));
    expect(onTogglePin).toHaveBeenCalledWith('chat-b');
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
