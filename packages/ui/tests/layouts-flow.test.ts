import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StepperStep } from '../src/components/stepper/types.ts';
import AuthSplitLayout from '../src/layouts/AuthSplitLayout.svelte';
import MarketingLayout from '../src/layouts/MarketingLayout.svelte';
import WizardLayout from '../src/layouts/WizardLayout.svelte';

afterEach(cleanup);

const snippet = (html: string) => createRawSnippet(() => ({ render: () => html }));

describe('flow layouts', () => {
  it('composes marketing navigation, hero, sections, and footer slots', () => {
    const view = render(MarketingLayout, {
      props: {
        brand: snippet('<a href="/">Northstar</a>'),
        navigation: snippet('<a href="/features">Features</a>'),
        actions: snippet('<a href="/signin">Sign in</a>'),
        hero: snippet('<h1>Build with confidence</h1>'),
        sections: snippet('<section aria-label="Features">Useful tools</section>'),
        footer: snippet('<p>Northstar example company</p>'),
      },
    });

    expect(view.container.querySelector('[data-py-marketing-layout]')).toBeTruthy();
    expect(view.getByRole('navigation', { name: 'Main navigation' }).textContent).toContain(
      'Features'
    );
    expect(view.getByRole('heading', { name: 'Build with confidence' })).toBeTruthy();
    expect(view.getByLabelText('Features').textContent).toContain('Useful tools');
    expect(view.container.querySelector('footer')?.textContent).toContain(
      'Northstar example company'
    );
  });

  it('wraps the existing Wizard with full-page framing and keeps its step behavior', async () => {
    const steps: StepperStep[] = [
      { id: 'account', label: 'Account' },
      { id: 'review', label: 'Review' },
    ];
    const content = snippet('<p data-wizard-step>Wizard step content</p>');
    const onFinish = vi.fn();
    const view = render(WizardLayout, {
      props: {
        steps,
        content,
        title: 'Create your workspace',
        description: 'A short setup for this fictional account.',
        onFinish,
      },
    });

    expect(view.container.querySelector('[data-py-wizard-layout]')).toBeTruthy();
    expect(view.getByRole('heading', { name: 'Create your workspace' })).toBeTruthy();
    expect(view.container.querySelector('[data-wizard-step]')?.textContent).toBe(
      'Wizard step content'
    );
    await fireEvent.click(view.getByRole('button', { name: 'Next' }));
    await waitFor(() =>
      expect(view.container.querySelector('li[aria-current="step"]')?.textContent).toContain(
        'Review'
      )
    );
    await fireEvent.click(view.getByRole('button', { name: 'Finish' }));
    await waitFor(() => expect(onFinish).toHaveBeenCalledOnce());
  });

  it('renders the auth form beside a token-colored generated brand panel that hides on narrow screens', () => {
    const view = render(AuthSplitLayout, {
      props: {
        form: snippet(
          '<form aria-label="Sign in form"><label>Email<input type="email" /></label></form>'
        ),
        brandTitle: 'Make work flow',
        brandDescription: 'A calm place for a fictional team.',
      },
    });

    expect(view.getByRole('form', { name: 'Sign in form' })).toBeTruthy();
    expect(view.getByRole('heading', { name: 'Make work flow' })).toBeTruthy();
    expect(view.getByLabelText('About this workspace').className).toContain('hidden');
    expect(view.container.querySelector('svg[aria-hidden="true"]')).toBeTruthy();
    expect(view.container.querySelector('[data-py-auth-split-layout]')?.className).toContain(
      'lg:grid-cols-2'
    );
  });
});
