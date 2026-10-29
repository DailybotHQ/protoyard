import type { CustomSlideProps } from '@protoyard/decks-ui/app';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import blueprint from '../blueprint.json';
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
  it('starts on the Team plan at 25 seats: 25 × $15 = $375 a month', () => {
    const { container } = mount();
    expect(screen.getByRole('radio', { name: /Team/ }).getAttribute('aria-checked')).toBe('true');
    expect(total(container)).toBe('$375');
    expect(breakdown(container)).toBe('25 seats × $15');
  });

  it('follows the plan choice and the seat count', async () => {
    const { container } = mount();
    await fireEvent.click(screen.getByRole('radio', { name: /Starter/ }));
    expect(total(container)).toBe('$200');
    const seats = screen.getByRole('slider');
    await fireEvent.input(seats, { target: { value: '40' } });
    expect(total(container)).toBe('$320');
    expect(breakdown(container)).toBe('40 seats × $8');
    expect(seats.getAttribute('aria-valuetext')).toBe('40 seats');
  });

  it('moves the selected plan with radio arrow keys', async () => {
    const { container } = mount();
    const team = screen.getByRole('radio', { name: /Team/ });
    team.focus();
    await fireEvent.keyDown(team, { key: 'ArrowRight' });
    expect(screen.getByRole('radio', { name: /Scale/ }).getAttribute('aria-checked')).toBe('true');
    expect(total(container)).toBe('$600');
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

  it('reveals the breakdown on its step, and always when the slide has no steps', () => {
    const before = mount(configurator.props.data, 0, 1);
    expect(breakdown(before.container)).toBeNull();
    expect(total(before.container)).toBe('$375');
    before.unmount();
    expect(breakdown(mount(configurator.props.data, 1, 1).container)).not.toBeNull();
    cleanup();
    expect(breakdown(mount(configurator.props.data, 0, 0).container)).not.toBeNull();
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

  it('keeps the seats within maxSeats: with 10 at most, every figure uses 10', () => {
    const { container } = mount({ ...configurator.props.data, maxSeats: 10 });
    const seats = screen.getByRole('slider');
    expect(seats.getAttribute('max')).toBe('10');
    expect((seats as HTMLInputElement).value).toBe('10');
    expect(total(container)).toBe('$150');
    expect(breakdown(container)).toBe('10 seats × $15');
    expect(seats.getAttribute('aria-valuetext')).toBe('10 seats');
  });

  it('drops repeated plan ids instead of failing the keyed lists', () => {
    const plans = [
      { id: 'solo', name: 'Solo', centsPerSeat: 500 },
      { id: 'solo', name: 'Solo again', centsPerSeat: 900 },
      { id: 'crew', name: 'Crew', centsPerSeat: 1_000 },
    ];
    const { container } = mount({ plans });
    expect(screen.getAllByRole('radio').map((radio) => radio.getAttribute('aria-label'))).toEqual([
      'Solo',
      'Crew',
    ]);
    expect(container.querySelectorAll('[data-pricing-bar]')).toHaveLength(2);
    // The default is the second plan (Crew at $10): 25 × $10.
    expect(total(container)).toBe('$250');
  });
});
