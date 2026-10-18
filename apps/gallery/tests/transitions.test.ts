import { describe, expect, it } from 'vitest';
import { transitionName } from '../src/lib/transitions';

describe('transitionName', () => {
  it('pairs a card and its detail page by slug and part', () => {
    expect(transitionName('icon', 'crm-demo')).toBe('py-icon-crm-demo');
    expect(transitionName('title', 'crm-demo')).toBe('py-title-crm-demo');
    expect(transitionName('icon', 'crm-demo')).not.toBe(transitionName('title', 'crm-demo'));
  });

  it('always yields a valid CSS identifier', () => {
    for (const slug of ['2fa-demo', 'Weird Slug!', 'a.b/c', '']) {
      expect(transitionName('icon', slug)).toMatch(/^py-[a-z]+-[a-z0-9-]*$/);
    }
  });
});
