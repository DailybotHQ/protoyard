import { describe, expect, it } from 'vitest';
import { chainHandlers, composeHandlers } from '../src/lib/handlers.ts';

describe('handler composition helpers', () => {
  it('composeHandlers runs the caller first and skips the own handler after preventDefault', () => {
    const order: string[] = [];
    const run = composeHandlers<Event>(
      () => order.push('caller'),
      () => order.push('own')
    );
    run(new Event('click', { cancelable: true }));
    expect(order).toEqual(['caller', 'own']);

    const taken = composeHandlers<Event>(
      (event) => event.preventDefault(),
      () => order.push('own again')
    );
    taken(new Event('click', { cancelable: true }));
    expect(order).toEqual(['caller', 'own']);
  });

  it('chainHandlers always runs the own handler, and tolerates no caller', () => {
    const order: string[] = [];
    chainHandlers<Event>(
      (event) => {
        event.preventDefault();
        order.push('caller');
      },
      () => order.push('own')
    )(new Event('focusin', { cancelable: true }));
    chainHandlers<Event>(undefined, () => order.push('own only'))(new Event('focusin'));
    expect(order).toEqual(['caller', 'own', 'own only']);
  });
});
