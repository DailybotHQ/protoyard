import type { CustomSlideProps } from '@protoyard/decks-ui/app';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { expectBootableWorld } from '../../../tests/support/smoke.ts';
import blueprint from '../blueprint.json';
import { definition } from '../src/prototype.ts';
import PricingConfigurator from '../src/slides/PricingConfigurator.svelte';

/**
 * The flagship's custom pricing slide:
 * plan choice, seats, the annual discount in integer cents, the step-gated
 * breakdown, defensive data (fallback plans, clamped seats, duplicate ids).
 */

afterEach(cleanup);

type Slide = CustomSlideProps['slide'];
const configurator = (blueprint as { deck: { slides: Slide[] } }).deck.slides.find(
  (slide) => slide.id === 'configurator'
) as Slide & { props: { data: Record<string, unknown> } };

function mount(data: Record<string, unknown> = configurator.props.data, step = 1, stepCount = 1) {
  return render(PricingConfigurator, {
    props: { slide: configurator, step, stepCount, data } as CustomSlideProps,
  });
}

const total = (container: HTMLElement) =>
  container.querySelector('[data-pricing-total]')?.textContent?.trim();
const breakdown = (container: HTMLElement) =>
  container.querySelector('[data-pricing-breakdown]')?.textContent?.replace(/\s+/g, ' ').trim() ??
  null;

describe('PricingConfigurator', () => {
  it('generates deterministic worlds and boots the default scenario', async () => {
    await expectBootableWorld(definition);
  });

  it('takes the annual discount off in integer cents and says how much was saved', async () => {
    const { container } = mount();
    await fireEvent.click(screen.getByRole('checkbox', { name: /Pay yearly \(20% off\)/ }));
    // 37,500 cents × 80% = 30,000 cents; the saving is 7,500 cents.
    expect(total(container)).toBe('$300');
    expect(breakdown(container)).toBe('25 seats × $15, minus $75 for paying yearly');
    // Odd totals round to whole cents: 7 Scale seats at $24 = 16,800 cents, minus 20% = 13,440.
    await fireEvent.click(screen.getByRole('radio', { name: /Scale/ }));
    await fireEvent.input(screen.getByRole('slider'), { target: { value: '7' } });
    expect(total(container)).toBe('$134');
    expect(breakdown(container)).toBe('7 seats × $24, minus $34 for paying yearly');
  });

  it('falls back to its own plans and defaults when the data is missing or wrong', () => {
    const { container } = mount({ plans: 'nope', maxSeats: 'many', annualDiscountPercent: -5 });
    expect(screen.getAllByRole('radio').map((radio) => radio.getAttribute('aria-label'))).toEqual([
      'Starter',
      'Team',
      'Scale',
    ]);
    expect(total(container)).toBe('$375');
    expect(screen.getByRole('slider').getAttribute('max')).toBe('200');
    expect(screen.getAllByRole('checkbox', { name: /Pay yearly \(0% off\)/ })).toHaveLength(1);
  });
});
