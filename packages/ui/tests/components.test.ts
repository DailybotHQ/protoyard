import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Avatar from '../src/components/avatar/Avatar.svelte';
import { groupMessages } from '../src/components/chat/group-messages.ts';
import MessageList from '../src/components/chat/MessageList.svelte';
import Composer from '../src/components/composer/Composer.svelte';
import { getPageTokens } from '../src/components/pagination/pages.ts';
import StatCard from '../src/components/stat-card/StatCard.svelte';
import TypingIndicator from '../src/components/typing-indicator/TypingIndicator.svelte';
import UserPicker from '../src/components/user-picker/UserPicker.svelte';
import FormHarness from './fixtures/FormHarness.svelte';
import KanbanHarness from './fixtures/KanbanHarness.svelte';
import ShellHarness from './fixtures/ShellHarness.svelte';
import WizardHarness from './fixtures/WizardHarness.svelte';

afterEach(() => cleanup());

describe('getPageTokens', () => {
  it('returns all pages when few, otherwise ellipses around the current page', () => {
    expect(getPageTokens(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(getPageTokens(1, 20)).toEqual([1, 2, 3, 4, 5, 'ellipsis-end', 20]);
    expect(getPageTokens(10, 20)).toEqual([1, 'ellipsis-start', 9, 10, 11, 'ellipsis-end', 20]);
    expect(getPageTokens(20, 20)).toEqual([1, 'ellipsis-start', 16, 17, 18, 19, 20]);
  });
});

describe('FormField', () => {
  it('wires id, aria-describedby and aria-invalid onto the control', () => {
    render(FormHarness, { error: 'Invalid email' });
    const input = screen.getByLabelText(/Email/);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const describedBy = input.getAttribute('aria-describedby')?.split(' ') ?? [];
    expect(describedBy).toHaveLength(2);
    const texts = describedBy.map((id) => document.getElementById(id)?.textContent);
    expect(texts).toEqual(['We never share it.', 'Invalid email']);
  });

  it('tabs default to the first item and switch on click', async () => {
    render(FormHarness, {});
    expect(screen.getByTestId('tab').textContent).toBe('overview');
    await fireEvent.click(screen.getByRole('tab', { name: 'Activity' }));
    expect(screen.getByTestId('tab').textContent).toBe('activity');
  });
});

describe('AppShell + Sidebar + Header', () => {
  it('renders navigation and opens the mobile drawer from the header menu button', async () => {
    render(ShellHarness, {});
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeTruthy();
    const home = screen.getByRole('link', { name: /Home/ });
    expect(home.getAttribute('aria-current')).toBe('page');
    await fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(screen.getByTestId('drawer').textContent).toBe('open');
    const dialog = await screen.findByRole('dialog');
    // Inside the drawer the sidebar is always expanded and has no collapse toggle.
    expect(within(dialog).queryByRole('button', { name: /Collapse/ })).toBeNull();
    await fireEvent.click(within(dialog).getByRole('link', { name: /Settings/ }));
    expect(screen.getByTestId('drawer').textContent).toBe('closed');
  });

  it('collapsed sidebar keeps accessible link names', async () => {
    render(ShellHarness, { collapsed: true });
    const link = screen.getByRole('link', { name: /Settings/ });
    expect(link.getAttribute('href')).toBe('#/settings');
    expect(link.hasAttribute('type')).toBe(false);
    await fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    expect(screen.getByRole('button', { name: /Collapse/ })).toBeTruthy();
  });
});

describe('Kanban', () => {
  it('groups items by column and moves through the keyboard-accessible menu', async () => {
    const onMoved = vi.fn();
    render(KanbanHarness, { onMoved });
    const todo = screen.getByRole('region', { name: 'To do' });
    expect(within(todo).getByText('Write brief')).toBeTruthy();

    await fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Move Write brief to another column' }),
      { button: 0, pointerType: 'mouse' }
    );
    const menu = await screen.findByRole('menu');
    const done = within(menu).getByRole('menuitem', { name: 'Done' });
    await fireEvent.click(done);
    await waitFor(() => expect(onMoved).toHaveBeenCalledWith('t1', 'done'));
    expect(
      within(screen.getByRole('region', { name: 'Done' })).getByText('Write brief')
    ).toBeTruthy();
  });
});

describe('Wizard', () => {
  it('blocks Next with a validation message, then advances and finishes', async () => {
    const onFinish = vi.fn();
    render(WizardHarness, { onFinish });
    await fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Name is required')).toBeTruthy();

    await fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Ada' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Ready, Ada')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
    await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(1));
  });
});

describe('Chat', () => {
  const ada = { id: 'u1', name: 'Ada Lovelace' };
  const bob = { id: 'u2', name: 'Bob Stone' };
  const messages = [
    { id: 'm1', author: ada, body: 'Hi', at: '2026-01-01T10:00:00Z' },
    { id: 'm2', author: ada, body: 'Are you there?', at: '2026-01-01T10:01:00Z' },
    { id: 'm3', author: bob, body: 'Yes!', at: '2026-01-01T10:02:00Z', status: 'read' as const },
  ];

  it('groups consecutive messages by author', () => {
    const groups = groupMessages(messages);
    expect(groups.map((g) => g.messages.length)).toEqual([2, 1]);
    expect(groups[0]?.dayStart).not.toBeNull();
    expect(groups[1]?.dayStart).toBeNull();
  });

  it('renders a log with own-message status', () => {
    render(MessageList, { messages, currentUserId: 'u2' });
    const log = screen.getByRole('log', { name: 'Messages' });
    expect(within(log).getByText('Are you there?')).toBeTruthy();
    expect(within(log).getByText('Read')).toBeTruthy();
  });

  it('Composer sends on Enter, keeps newline on Shift+Enter and clears after submit', async () => {
    const onSubmit = vi.fn(async () => {});
    render(Composer, { onSubmit });
    const box = screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement;
    await fireEvent.input(box, { target: { value: 'Hello' } });
    await fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
    await fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('Hello'));
    await waitFor(() => expect(box.value).toBe(''));
  });

  it('TypingIndicator announces who is typing', () => {
    render(TypingIndicator, { names: ['Ada', 'Bob'] });
    expect(screen.getByRole('status').textContent).toContain('Ada and Bob are typing');
  });
});

describe('Display components', () => {
  it('Avatar shows initials with a deterministic tone', () => {
    const first = render(Avatar, { name: 'Grace Hopper' });
    const avatar = screen.getByRole('img', { name: 'Grace Hopper' });
    expect(avatar.textContent?.trim()).toBe('GH');
    const tone = avatar.className;
    first.unmount();
    render(Avatar, { name: 'Grace Hopper' });
    expect(screen.getByRole('img', { name: 'Grace Hopper' }).className).toBe(tone);
  });

  it('StatCard colors deltas by whether the direction is good', () => {
    render(StatCard, { label: 'Churn', value: '2.1%', delta: -0.4, positive: 'down' });
    const delta = screen.getByText('-0.4');
    expect(delta.className).toContain('text-success');
    expect(delta.textContent).toContain('Decreased');
  });

  it('UserPicker inline selects a user', async () => {
    const onValueChange = vi.fn();
    render(UserPicker, {
      variant: 'inline',
      users: [
        { id: 'a', name: 'Ada Lovelace', subtitle: 'Admin' },
        { id: 'b', name: 'Bob Stone', subtitle: 'Viewer' },
      ],
      onValueChange,
    });
    await fireEvent.click(screen.getByRole('option', { name: /Bob Stone/ }));
    expect(onValueChange).toHaveBeenCalledWith('b', expect.objectContaining({ name: 'Bob Stone' }));
  });
});
