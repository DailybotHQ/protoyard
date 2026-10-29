import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Tabs from '../src/components/tabs/Tabs.svelte';
import { Progress, RadioGroup, Separator } from '../src/index.ts';
import SimplePrimitivesHarness from './fixtures/SimplePrimitivesHarness.svelte';

/*
 * Checkbox, Switch, RadioGroup, Accordion, Separator and Progress come from
 * texuli through the @protoyard/ui barrel; Tabs is Protoyard's wrapper on
 * @texuli/primitives. These cover what Protoyard relies on: bindable refs,
 * states and tab stops, wrapping tabs with unmounted inactive panels, and the
 * accordion and progress semantics.
 */

afterEach(() => cleanup());

describe('Texuli-backed simple controls', () => {
  it('binds each control’s element through ref', async () => {
    const onrefs = vi.fn();
    render(SimplePrimitivesHarness, { onrefs });
    await waitFor(() => {
      const refs = onrefs.mock.lastCall?.[0] as Record<string, Element | null>;
      // A labelled control's ref is its field (label included).
      expect(refs.checkbox?.contains(screen.getByRole('checkbox', { name: 'Remember me' }))).toBe(
        true
      );
      expect(refs.switch?.contains(screen.getByRole('switch', { name: 'Alerts' }))).toBe(true);
      expect(refs.tabs?.contains(screen.getByRole('tablist', { name: 'Sections' }))).toBe(true);
    });
  });

  it('toggles the checkbox and switch with their states', async () => {
    render(SimplePrimitivesHarness);
    const box = screen.getByRole('checkbox', { name: 'Remember me' });
    await fireEvent.click(box);
    expect(box.getAttribute('aria-checked')).toBe('true');
    expect(box.getAttribute('data-state')).toBe('checked');
    const toggle = screen.getByRole('switch', { name: 'Alerts' });
    await fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(toggle.querySelector('[data-state="checked"]')).not.toBeNull();
  });

  it('selects a radio with one tab stop', async () => {
    render(SimplePrimitivesHarness);
    const team = screen.getByRole('radio', { name: 'Team' });
    // A click focuses the radio first in a browser.
    team.focus();
    await fireEvent.click(team);
    expect(team.getAttribute('aria-checked')).toBe('true');
    expect(team.tabIndex).toBe(0);
    expect(screen.getByRole('radio', { name: 'Free' }).tabIndex).toBe(-1);
  });

  it('selects the first tab, wraps with the arrow keys, and mounts only the active panel', async () => {
    render(SimplePrimitivesHarness);
    await waitFor(() => expect(screen.getByTestId('tab').textContent).toBe('overview'));
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    expect(screen.getByRole('tabpanel').textContent).toContain('Overview panel');
    const overview = screen.getByRole('tab', { name: 'Overview' });
    overview.focus();
    await fireEvent.keyDown(overview, { key: 'ArrowLeft' });
    const settings = screen.getByRole('tab', { name: 'Settings' });
    expect(document.activeElement).toBe(settings);
    await waitFor(() => expect(screen.getByTestId('tab').textContent).toBe('settings'));
    expect(settings.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel', { name: 'Settings' }).textContent).toContain(
      'Settings panel'
    );
  });

  it('opens one accordion item at a time', async () => {
    render(SimplePrimitivesHarness);
    const billing = screen.getByRole('button', { name: 'Billing' });
    expect(billing.closest('h3')).not.toBeNull();
    await fireEvent.click(billing);
    expect(billing.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('open').textContent).toBe('billing');
    const region = screen.getByRole('region', { name: 'Billing' });
    expect(region.textContent).toContain('Invoices go out monthly.');
    await fireEvent.click(screen.getByRole('button', { name: 'Security' }));
    expect(screen.getByTestId('open').textContent).toBe('security');
    expect(billing.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('the selected item is the tab stop (APG radio group and tabs)', () => {
  it('starts a radio group’s tab stop on its checked radio', async () => {
    render(RadioGroup, {
      value: 'team',
      'aria-label': 'Plan',
      items: [
        { value: 'free', label: 'Free' },
        { value: 'team', label: 'Team' },
      ],
    });
    await tick();
    expect(screen.getByRole('radio', { name: 'Team' }).tabIndex).toBe(0);
    expect(screen.getByRole('radio', { name: 'Free' }).tabIndex).toBe(-1);
  });

  it('starts a tab list’s tab stop on its selected tab', async () => {
    render(Tabs, {
      value: 'activity',
      label: 'Sections',
      items: [
        { value: 'overview', label: 'Overview' },
        { value: 'activity', label: 'Activity' },
      ],
    });
    await tick();
    expect(screen.getByRole('tab', { name: 'Activity' }).tabIndex).toBe(0);
    expect(screen.getByRole('tab', { name: 'Overview' }).tabIndex).toBe(-1);
  });
});

describe('Separator and Progress on Texuli', () => {
  it('keeps separators decorative by default, semantic on request', () => {
    const { container } = render(Separator, { orientation: 'vertical' });
    const decorative = container.querySelector('[data-separator-root]');
    expect(decorative?.getAttribute('role')).toBe('none');
    expect(decorative?.getAttribute('data-orientation')).toBe('vertical');
    cleanup();
    render(Separator, { orientation: 'vertical', decorative: false });
    expect(screen.getByRole('separator').getAttribute('aria-orientation')).toBe('vertical');
  });

  it('reports a labelled determinate value and an indeterminate state', () => {
    render(Progress, { value: 30, max: 60, label: 'Upload', showValue: true });
    const bar = screen.getByRole('progressbar', { name: 'Upload' });
    expect(bar.getAttribute('aria-valuenow')).toBe('30');
    expect(bar.getAttribute('aria-valuemax')).toBe('60');
    expect(bar.getAttribute('aria-valuetext')).toBe('50%');
    cleanup();
    render(Progress, { value: null, ariaLabel: 'Syncing' });
    const busy = screen.getByRole('progressbar', { name: 'Syncing' });
    expect(busy.hasAttribute('aria-valuenow')).toBe(false);
    expect(busy.getAttribute('data-state')).toBe('indeterminate');
    expect(busy.getAttribute('aria-valuetext')).toBe('Loading');
  });
});
