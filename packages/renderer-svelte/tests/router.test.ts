import { describe, expect, it } from 'vitest';
import { createRouter, fillParams, navigate } from '../src/router/hash-router.svelte.ts';
import { compilePattern } from '../src/router/match.ts';

describe('hash route matching', () => {
  it('matches params, wildcards and decodes safely', () => {
    expect(compilePattern('/deals/:id').match('/deals/deal%200001')).toEqual({ id: 'deal 0001' });
    expect(compilePattern('/deals/:id').match('/deals')).toBeNull();
    expect(compilePattern('/deals/:id').match('/deals/1/edit')).toBeNull();
    expect(compilePattern('/docs/*').match('/docs/a/b')).toEqual({ '*': 'a/b' });
    expect(compilePattern('/x/:id').match('/x/%E0%A4%A')).toEqual({ id: '%E0%A4%A' });
    expect(fillParams('/deals/:id/edit', { id: 'a/b' })).toBe('/deals/a%2Fb/edit');
    expect(compilePattern('/notes/:id?').match('/notes')).toEqual({});
    expect(compilePattern('/notes/:id?').match('/notes/n1')).toEqual({ id: 'n1' });
    expect(compilePattern('/notes/:id?').match('/notes/n1/x')).toBeNull();
  });
});

describe('createRouter', () => {
  const Dummy = (() => {}) as never;

  it('prefers static segments and follows hashchange', async () => {
    location.hash = '';
    const router = createRouter([
      { path: '/', component: Dummy },
      { path: '/deals/:id', component: Dummy },
      { path: '/deals/new', component: Dummy, title: 'New deal' },
    ]);
    expect(router.current.path).toBe('/');
    navigate('/deals/new');
    await new Promise((r) => setTimeout(r, 0));
    expect(router.current.route?.path).toBe('/deals/new');
    navigate('/deals/42');
    await new Promise((r) => setTimeout(r, 0));
    expect(router.current.params).toEqual({ id: '42' });
    expect(router.isActive('/deals')).toBe(true);
    expect(router.isActive('/', true)).toBe(false);
    navigate('/nope', { replace: true });
    expect(router.current.route).toBeNull();
    expect(router.href('/deals/:id', { id: '7' })).toBe('#/deals/7');
    router.destroy();
  });
});

// Lazy-route loading, cache, failure + retry, and <Router> UI live in router-lazy.test.ts.
