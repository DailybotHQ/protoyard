import { cleanup, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import Showcase from './fixtures/Showcase.svelte';

afterEach(() => cleanup());

describe('component showcase', () => {
  it('renders every inline component without runtime errors', () => {
    render(Showcase, {});
    expect(screen.getByRole('combobox', { name: 'Plan' }).textContent).toContain('Beta');
    expect((screen.getByRole('combobox', { name: 'Fruit' }) as HTMLInputElement).value).toBe(
      'Alpha'
    );
    expect(
      screen.getByRole('checkbox', { name: 'Accept terms' }).getAttribute('aria-checked')
    ).toBe('true');
    expect(screen.getByRole('switch', { name: 'Notifications' })).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(screen.getByRole('progressbar', { name: 'Upload' }).getAttribute('aria-valuenow')).toBe(
      '40'
    );
    const pagination = screen.getByRole('navigation', { name: 'Pagination' });
    expect(
      within(pagination).getByRole('button', { name: 'Page 3' }).getAttribute('aria-current')
    ).toBe('page');
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByText('Atlas').getAttribute('aria-current')).toBe('page');
    expect(screen.getByText('First body')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Card title' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Boom');
    expect(screen.getByRole('log', { name: 'Messages' }).textContent).toContain('Hello');
    expect(screen.getByText('Ada is typing')).toBeTruthy();
  });

  it.each([
    ['dialog', 'Edit profile', 'Dialog body'],
    ['panel', 'Ticket #42', 'Panel body'],
    ['sheet', 'Share', 'Sheet body'],
  ] as const)('renders the %s overlay with an accessible name', async (overlay, title, body) => {
    render(Showcase, { overlay });
    const dialog = await screen.findByRole('dialog');
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
    expect(within(dialog).getByText(title)).toBeTruthy();
    expect(within(dialog).getByText(body)).toBeTruthy();
  });
});
