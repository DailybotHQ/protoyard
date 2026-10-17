import { describe, expect, it } from 'vitest';
import { compilePattern, parseHash, toHref } from '../src/router/match.ts';
import { createRouter, fillParams, navigate } from '../src/router/router.svelte.ts';

describe('hash route matching', () => {
  it('normalizes hashes and keeps hash queries', () => {
    expect(parseHash('#/deals/')).toMatchObject({ path: '/deals' });
    expect(parseHash('').path).toBe('/');
    expect(parseHash('#/deals?stage=won').query.get('stage')).toBe('won');
    expect(toHref('/deals/1')).toBe('#/deals/1');
    expect(toHref('#deals')).toBe('#/deals');
  });

  it('matches params, wildcards and decodes safely', () => {
    expect(compilePattern('/deals/:id').match('/deals/deal%200001')).toEqual({ id: 'deal 0001' });
    expect(compilePattern('/deals/:id').match('/deals')).toBeNull();
    expect(compilePattern('/deals/:id').match('/deals/1/edit')).toBeNull();
    expect(compilePattern('/docs/*').match('/docs/a/b')).toEqual({ '*': 'a/b' });
    expect(compilePattern('/x/:id').match('/x/%E0%A4%A')).toEqual({ id: '%E0%A4%A' });
    expect(fillParams('/deals/:id/edit', { id: 'a/b' })).toBe('/deals/a%2Fb/edit');
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

describe('lazy routes', () => {
  it('loads a route component once and caches it', async () => {
    const Dummy = (() => {}) as never;
    let calls = 0;
    const router = createRouter([
      { path: '/', component: Dummy },
      {
        path: '/reports',
        load: async () => {
          calls++;
          return { default: Dummy };
        },
      },
    ]);
    const route = router.routes[1] as (typeof router.routes)[number];
    await expect(router.resolve(route)).resolves.toBe(Dummy);
    await router.resolve(route);
    expect(calls).toBe(1);
    expect(router.resolve(router.routes[0] as never)).toBe(Dummy);
    expect(() => createRouter([{ path: '/x' }])).toThrow(/needs a component/);
    router.destroy();
  });
});
