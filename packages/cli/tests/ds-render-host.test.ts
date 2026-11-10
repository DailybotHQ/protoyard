// The page half of `check ds --render` without a browser: Texuli's prebuilt
// host IIFE and Protoyard's page reader, evaluated in happy-dom the way
// `browser.ts` evaluates them in the isolated world.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DS_RENDER_COMPONENT_ATTRIBUTE,
  DS_RENDER_HOST_GLOBAL,
  dsRenderHostPath,
  dsRenderHostScript,
  INSTALL_HOST,
} from '../src/lib/ds-render/host-script.ts';
import type { DsRenderPageInfo } from '../src/lib/ds-render/index.ts';

/**
 * Runs a script as a page script would: a top-level `var` becomes a global.
 * The scripts are the CLI's and Texuli's own source, never page data.
 */
function evaluate(source: string): unknown {
  const host = /^var (\w+)=/.exec(source)?.[1];
  if (host) {
    (globalThis as Globals)[host] = new Function(`${source}\nreturn ${host};`)();
    return undefined;
  }
  return new Function(`return ${source};`)();
}

type Globals = Record<string, unknown>;

afterEach(() => {
  delete (globalThis as Globals)[DS_RENDER_HOST_GLOBAL];
  delete (globalThis as Globals).texuliDsCheck;
  document.body.replaceChildren();
});

describe("Texuli's prebuilt ds-check host", () => {
  it('is read from the installed @texuli/tools, not bundled at run time', () => {
    expect(dsRenderHostPath()).toMatch(
      /@texuli[/\\]tools[/\\]dist[/\\]ds-check[/\\]host\.iife\.js$/
    );
    const script = dsRenderHostScript();
    expect(script.startsWith(`var ${DS_RENDER_HOST_GLOBAL}=`)).toBe(true);
    // Same text on every call (read once per process).
    expect(dsRenderHostScript()).toBe(script);
    expect(script).toBe(readFileSync(dsRenderHostPath(), 'utf8'));
  });

  it('installs on #app, reads data-tx-component roots and copies no attribute', () => {
    document.body.innerHTML = `<div id="app"><main>
      <a href="#/deals/deal_0001">Deal</a><a href="#/settings?tab=1">Settings</a><a href="https://example.com">Out</a>
      <button data-tx-component="button" data-tx-variant="ghost" data-tx-size="sm">Save</button>
      <button data-tx-component="button" data-tx-variant="ghost" data-tx-size="sm">Again</button>
      <span data-tx-component="badge">New</span>
      <canvas></canvas>
      <div data-tx-component="charts-line"><canvas></canvas></div>
    </main></div>`;
    const before = document.body.innerHTML;
    evaluate(dsRenderHostScript());
    const info = (evaluate(`(${INSTALL_HOST})`) as (arg: unknown) => DsRenderPageInfo)([
      '#app',
      48,
    ]);
    expect(info).toMatchObject({
      scope: '#app',
      roots: 4,
      links: ['/deals/deal_0001', '/settings'],
      unownedVisualizations: [{ tag: 'canvas', selector: 'div#app>main>canvas' }],
    });
    // One entry per distinct axis set.
    expect(info.axes).toEqual([
      {
        component: 'button',
        selector: 'div#app>main>button:nth-of-type(1)',
        variant: 'ghost',
        size: 'sm',
      },
    ]);
    const host = (globalThis as Globals).texuliDsCheck as { map: (input: unknown) => unknown };
    expect(typeof host?.map).toBe('function');
    // Texuli's host reads data-tx-component itself: no data-ds-check-component copy.
    expect(document.querySelector('[data-ds-check-component]')).toBeNull();
    // Only Texuli's own scope marker and its inline style are added.
    expect(document.querySelector('#app')?.hasAttribute('data-ds-check-scope')).toBe(true);
    expect(document.body.innerHTML.replace(/ (?:style|data-ds-check-scope)="[^"]*"/g, '')).toBe(
      before
    );
  });

  it('maps against the allow set with data-tx-component even when the page carries data-ds-check-component', () => {
    document.body.innerHTML = `<div id="app">
      <span data-ds-check-component="button" hidden></span>
      <div data-tx-component="dialog"><button type="button">Close</button></div>
      <button type="button">Raw</button>
    </div>`;
    evaluate(dsRenderHostScript());
    (evaluate(`(${INSTALL_HOST})`) as (arg: unknown) => DsRenderPageInfo)(['#app', 48]);
    const host = (globalThis as Globals).texuliDsCheck as {
      map: (input: unknown) => { errors: { code: string; source?: string }[] };
    };
    const mapping = host.map({ allow: { button: true } });
    expect(mapping.errors.map((e) => [e.code, e.source ?? null])).toEqual([
      ['not-allowed', 'dialog'],
      ['unmapped', null],
    ]);
    expect(DS_RENDER_COMPONENT_ATTRIBUTE).toBe('data-tx-component');
  });

  it('falls back to body and refuses to run without the host', () => {
    expect(() =>
      (evaluate(`(${INSTALL_HOST})`) as (arg: unknown) => DsRenderPageInfo)(['#app', 48])
    ).toThrow(/host is not loaded/);
    evaluate(dsRenderHostScript());
    const info = (evaluate(`(${INSTALL_HOST})`) as (arg: unknown) => DsRenderPageInfo)([
      '#app',
      48,
    ]);
    expect(info).toMatchObject({ scope: 'body', roots: 0, links: [], axes: [] });
  });
});
