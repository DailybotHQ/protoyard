import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Progress from '../src/components/progress/Progress.svelte';
import RadioGroup from '../src/components/radio-group/RadioGroup.svelte';
import Separator from '../src/components/separator/Separator.svelte';
import Tabs from '../src/components/tabs/Tabs.svelte';
import SimplePrimitivesHarness from './fixtures/SimplePrimitivesHarness.svelte';

/*
 * Separator, Progress, Checkbox, Switch, RadioGroup, Tabs and Accordion run on
 * @texuli/primitives. These cover the seams the wrappers own: bindable refs,
 * Protoyard's defaults (decorative separators, wrapping tabs, inactive panels
 * unmounted) and the accordion's size variable for the collapse animation.
 */

afterEach(() => cleanup());

describe('Texuli-backed simple controls', () => {
  it('binds each control’s element through ref', async () => {
    const onrefs = vi.fn();
    render(SimplePrimitivesHarness, { onrefs });
    await waitFor(() => {
      const refs = onrefs.mock.lastCall?.[0] as Record<string, Element | null>;
      expect(refs.checkbox).toBe(screen.getByRole('checkbox', { name: 'Remember me' }));
      expect(refs.switch).toBe(screen.getByRole('switch', { name: 'Alerts' }));
      expect(refs.radio).toBe(screen.getByRole('radiogroup', { name: 'Plan' }));
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

  it('opens one accordion item and exposes its size for the collapse animation', async () => {
    render(SimplePrimitivesHarness);
    const billing = screen.getByRole('button', { name: 'Billing' });
    expect(billing.closest('h3')).not.toBeNull();
    await fireEvent.click(billing);
    expect(billing.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('open').textContent).toBe('billing');
    const region = screen.getByRole('region', { name: 'Billing' });
    expect(region.textContent).toContain('Invoices go out monthly.');
    expect(region.classList.contains('ui-anim-collapse')).toBe(true);
    expect(region.style.getPropertyValue('--tx-accordion-content-height')).toMatch(/px$/);
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
