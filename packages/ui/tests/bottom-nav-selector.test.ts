import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOTTOM_NAV_SELECTOR } from '../src/index.ts';

describe('BOTTOM_NAV_SELECTOR', () => {
  it('finds every pinned phone tab bar: ours, Texuli’s BottomNav and its mobile-tabs layout', () => {
    for (const marker of ['data-py-bottom-nav', 'data-tx-bottom-nav', 'data-tx-mobile-tabs']) {
      const nav = document.createElement('nav');
      nav.setAttribute(marker, '');
      document.body.append(nav);
      expect(document.querySelector(BOTTOM_NAV_SELECTOR), marker).toBe(nav);
      nav.remove();
    }
  });
});

describe('the DevTools launcher keeps clear of the same tab bars', () => {
  it('uses BOTTOM_NAV_SELECTOR verbatim (DevTools does not depend on @protoyard/ui)', () => {
    const panel = readFileSync(resolve(__dirname, '../../devtools/src/Panel.svelte'), 'utf8');
    expect(panel).toContain(`'${BOTTOM_NAV_SELECTOR}'`);
  });
});
