import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { groupMessages, MessageList, TypingIndicator } from '@texuli/chat';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Avatar from '../src/components/avatar/Avatar.svelte';
import BottomNav from '../src/components/bottom-nav/BottomNav.svelte';
import Composer from '../src/components/composer/Composer.svelte';
import MobileHeader from '../src/components/mobile-header/MobileHeader.svelte';
import { getPageTokens } from '../src/components/pagination/pages.ts';
import StatCard from '../src/components/stat-card/StatCard.svelte';
import UserPicker from '../src/components/user-picker/UserPicker.svelte';
import FormHarness from './fixtures/FormHarness.svelte';
import KanbanHarness from './fixtures/KanbanHarness.svelte';
import MobileShellHarness from './fixtures/MobileShellHarness.svelte';
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
    // Phone width: the drawer only exists below the `lg` breakpoint.
    const wide = vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: false,
          media: query,
          addEventListener() {},
          removeEventListener() {},
        }) as never
    );
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
    wide.mockRestore();
  });

  it('closes the drawer on hash navigation triggered from code', async () => {
    const narrow = vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: false,
          media: query,
          addEventListener() {},
          removeEventListener() {},
        }) as never
    );
    render(ShellHarness, {});
    await fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(screen.getByTestId('drawer').textContent).toBe('open');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await waitFor(() => expect(screen.getByTestId('drawer').textContent).toBe('closed'));
    narrow.mockRestore();
  });

  it('never keeps an invisible drawer open on wide screens', async () => {
    const wide = vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: true,
          media: query,
          addEventListener() {},
          removeEventListener() {},
        }) as never
    );
    render(ShellHarness, {});
    await fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    await waitFor(() => expect(screen.getByTestId('drawer').textContent).toBe('closed'));
    wide.mockRestore();
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

describe('MobileAppShell', () => {
  it('keeps the header, primary actions and non-fixed navigation around one scrollable main landmark', () => {
    render(MobileShellHarness);

    const main = screen.getByRole('main');
    const navigation = screen.getByRole('navigation', { name: 'Primary' });
    expect(screen.getByRole('banner')).toBeTruthy();
    expect(main.getAttribute('tabindex')).toBe('-1');
    expect(main.id).toBe('mobile-app-content');
    // Texuli's MobileAppFrame: the screen region is the only scroller.
    expect(main.hasAttribute('data-tx-mobile-frame-main')).toBe(true);
    const save = screen.getByRole('button', { name: 'Save changes' });
    // The caller's footer sits between the screen and the navigation, unwrapped.
    expect(main.contains(save)).toBe(false);
    expect(save.closest('[data-tx-mobile-frame-footer]')).toBeNull();
    expect(main.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      save.compareDocumentPosition(navigation) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(navigation.className).not.toContain('tx-mobile-tabs--fixed');
    expect(navigation.hasAttribute('data-py-bottom-nav')).toBe(true);
  });

  it('keeps its default height out of the class list, so a caller height class wins', () => {
    // The frame height (`--tx-app-height`) lives in Texuli's `@layer tx.components`,
    // which the renderer orders below Tailwind's utilities.
    render(MobileShellHarness, { class: 'h-[640px]' });
    const root = screen.getByRole('main').parentElement as HTMLElement;
    expect(root.hasAttribute('data-tx-mobile-frame')).toBe(true);
    expect(root.classList.contains('ui-mobile-app-shell')).toBe(true);
    expect(root.classList.contains('h-[640px]')).toBe(true);
    expect(root.classList.contains('h-app')).toBe(false);
    const css = readFileSync(
      join(process.cwd(), 'packages/ui/node_modules/texuli/dist/layouts/mobile/mobile.css'),
      'utf8'
    );
    const frameRule = css.slice(css.indexOf('.tx-mobile-frame {'));
    expect(css).toContain('@layer tx.components {');
    expect(frameRule).toMatch(/block-size: var\(--tx-app-height, 100dvh\)/);
    const appCss = readFileSync(
      join(process.cwd(), 'packages/renderer-svelte/src/app.css'),
      'utf8'
    );
    const order =
      appCss
        .match(/@layer ([^;]+);/)?.[1]
        ?.split(',')
        .map((name) => name.trim()) ?? [];
    expect(order.indexOf('tx.components')).toBeLessThan(order.indexOf('utilities'));
  });

  it('resets the main scroll position when the hash route changes', async () => {
    render(MobileShellHarness);
    const main = screen.getByRole('main');
    main.scrollTop = 120;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await waitFor(() => expect(main.scrollTop).toBe(0));
  });

  it('skip link focuses the screen instead of changing the hash route', async () => {
    render(MobileShellHarness);
    await fireEvent.click(screen.getByRole('link', { name: 'Skip to content' }));
    expect(document.activeElement).toBe(screen.getByRole('main'));
  });
});

describe('BottomNav', () => {
  it('marks the active item, keeps badges in the link name and pins by default', () => {
    render(BottomNav, {
      items: [
        { label: 'Home', href: '#/home', active: true },
        { label: 'Inbox', href: '#/inbox', badge: 3 },
      ],
    });
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(nav.className).toContain('tx-mobile-tabs--fixed');
    expect(nav.hasAttribute('data-py-bottom-nav')).toBe(true);
    expect(screen.getByRole('link', { name: 'Home' }).getAttribute('aria-current')).toBe('page');
    const inbox = screen.getByRole('link', { name: 'Inbox 3' });
    expect(inbox.getAttribute('href')).toBe('#/inbox');
    expect(inbox.hasAttribute('aria-current')).toBe(false);
  });
});

describe('MobileHeader', () => {
  it('renders Back as a link or a button with the given label, then title and actions', async () => {
    const onBack = vi.fn();
    render(MobileHeader, { title: 'Account', subtitle: 'Checking', onBack, backLabel: 'Accounts' });
    expect(screen.getByRole('heading', { level: 1, name: 'Account' })).toBeTruthy();
    expect(screen.getByText('Checking')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Accounts' }));
    expect(onBack).toHaveBeenCalledTimes(1);
    cleanup();

    render(MobileHeader, { title: 'Detail', titleAs: 'p', backHref: '#/list', sticky: false });
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getByRole('link', { name: 'Back' }).getAttribute('href')).toBe('#/list');
    expect(screen.getByRole('banner').className).toContain('tx-mobile-header--static');
  });
});

describe('Kanban', () => {
  const column = (name: string) => screen.getByRole('list', { name });
  const live = () => document.querySelector('[aria-live="polite"]')?.textContent ?? '';

  it('groups items by column in item order and moves through the keyboard-accessible menu', async () => {
    const onMoved = vi.fn();
    render(KanbanHarness, { onMoved });
    expect(
      within(column('To do'))
        .getAllByRole('listitem')
        .map((item) => item.textContent?.match(/Write brief|Plan sprint/)?.[0])
    ).toEqual(['Write brief', 'Plan sprint']);

    await fireEvent.click(
      screen.getByRole('button', { name: 'Move Write brief to another column' })
    );
    const menu = await screen.findByRole('menu', {}, { timeout: 5000 });
    // Moving inside its own column is not offered: the host saves columns, not order.
    expect(
      within(menu).getByRole('menuitem', { name: 'To do — top' }).getAttribute('aria-disabled')
    ).toBe('true');
    await fireEvent.click(within(menu).getByRole('menuitem', { name: 'Done — top' }));
    await waitFor(() => expect(onMoved).toHaveBeenCalledWith('t1', 'done'));
    await waitFor(() => expect(within(column('Done')).getByText('Write brief')).toBeTruthy());
    expect(within(column('To do')).queryByText('Write brief')).toBeNull();
    expect(live()).toContain('Moved Write brief to Done');
  });

  it('passes the column to columnFooter, shows descriptions and follows headingLevel', () => {
    render(KanbanHarness, { withFooter: true, headingLevel: 4 });
    expect(screen.getByRole('heading', { level: 4, name: 'In progress' })).toBeTruthy();
    expect(screen.getByTestId('footer-doing').textContent).toBe('Add to In progress');
    expect(screen.getByTestId('footer-done').textContent).toBe('Add to Done');
    expect(screen.getByText('Limit: 3')).toBeTruthy();
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
    const delta = screen.getByText('-0.4').closest('.tx-stat__delta') as HTMLElement;
    // Texuli's Stat: a good decrease gets the "good" tone.
    expect(delta.className).toContain('tx-stat__delta--good');
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
