// The page half of `check ds --render` without a browser: Texuli's prebuilt
// host IIFE and Protoyard's page reader, evaluated in happy-dom the way
// `browser.ts` evaluates them in the isolated world.
import { readFileSync } from 'node:fs';
import { type DsCheckPage, mapLockedRenderPage } from '@texuli/tools/ds-check';
import { afterEach, describe, expect, it } from 'vitest';
import { dsCatalog } from '../src/lib/ds-catalog.ts';
import {
  DS_RENDER_CHECK_GLOBAL,
  DS_RENDER_COMPONENT_ATTRIBUTE,
  DS_RENDER_HOST_EXPORT,
  DS_RENDER_HOST_GLOBAL,
  dsRenderHostPath,
  dsRenderHostScript,
  INSTALL_HOST,
} from '../src/lib/ds-render/host-script.ts';
import { type DsRenderPageInfo, renderAllowManifest } from '../src/lib/ds-render/index.ts';

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
    // The package export (Texuli 0.17.1), not a file guessed beside another export.
    expect(DS_RENDER_HOST_EXPORT).toBe('@texuli/tools/ds-check/host.iife.js');
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

  /** A `DsCheckPage` that evaluates in this document (the isolated world's stand-in). */
  const inPage = {
    evaluate: async (fn: (arg: unknown) => unknown, arg: unknown) => fn(arg),
    waitForFunction: async (fn: (arg: unknown) => unknown, arg: unknown) => fn(arg),
  } as unknown as DsCheckPage;

  /**
   * Installs the real host on `#app` and maps it the way `browser.ts` does:
   * Texuli's `mapLockedRenderPage`, which calls the host's `map`.
   */
  async function mapPage(
    html: string,
    manifest: { allow?: Record<string, true>; composed?: Record<string, string> }
  ): Promise<[string, string | null][]> {
    document.body.innerHTML = `<div id="app">${html}</div>`;
    evaluate(dsRenderHostScript());
    (evaluate(`(${INSTALL_HOST})`) as (arg: unknown) => DsRenderPageInfo)(['#app', 48]);
    expect(DS_RENDER_CHECK_GLOBAL in globalThis).toBe(true);
    const report = await mapLockedRenderPage(inPage, manifest);
    return report.errors.map((e) => [e.code, e.source ?? null]);
  }

  it('refuses a data-grid nested in an allowed card (regression guard on Texuli 0.17.1)', async () => {
    const manifest = renderAllowManifest(dsCatalog(), { card: {}, button: {} } as never);
    expect(
      await mapPage(
        `<div data-tx-component="card"><button data-tx-component="button" type="button">Edit</button>
          <div data-tx-component="data-grid"><button type="button">Sort</button></div></div>`,
        manifest
      )
    ).toEqual([['not-allowed', 'data-grid']]);
  });

  it('allows the six part relations inside and outside their allowed parent', async () => {
    const pairs: [string, string][] = [
      ['list-item', 'list'],
      ['field-error', 'field'],
      ['input-group', 'input'],
      ['radio-group', 'radio'],
      ['button-group', 'button'],
      ['data-dashboard-widget', 'data-dashboard'],
    ];
    const allow = Object.fromEntries(pairs.map(([, parent]) => [parent, {}]));
    const manifest = renderAllowManifest(dsCatalog(), allow as never);
    const html = pairs
      .map(
        ([part, parent]) =>
          `<div data-tx-component="${parent}"><span data-tx-component="${part}"></span></div><span data-tx-component="${part}"></span>`
      )
      .join('');
    expect(await mapPage(html, manifest)).toEqual([]);
    // Without the parents (allow: card only) every part is refused, in both places.
    const refused = await mapPage(html, renderAllowManifest(dsCatalog(), { card: {} } as never));
    for (const [part] of pairs)
      expect(refused.filter(([code, id]) => code === 'not-allowed' && id === part)).toHaveLength(2);
  });

  it('refuses an id that only shares a prefix with an allowed one (Texuli 0.17.2)', async () => {
    const pairs: [string, string][] = [
      ['alert-dialog', 'alert'],
      ['icon-button', 'icon'],
      ['form-field', 'form'],
      ['form-submit', 'form'],
      ['code-field', 'code'],
      ['text-counter', 'text'],
    ];
    const ids = new Set(dsCatalog().components.map((component) => component.id));
    const known = pairs.filter(([id, prefix]) => ids.has(id) && ids.has(prefix));
    // At least the three named in the 0.17.2 notes are catalog ids here.
    expect(known.map(([id]) => id)).toEqual(
      expect.arrayContaining(['alert-dialog', 'icon-button', 'form-field'])
    );
    const allow = Object.fromEntries(known.map(([, prefix]) => [prefix, {}]));
    const manifest = renderAllowManifest(dsCatalog(), allow as never);
    for (const [id] of known) expect(manifest.composed[id], id).toBeUndefined();
    const html = known
      .map(
        ([id, prefix]) =>
          `<div data-tx-component="${prefix}"><span data-tx-component="${id}"></span></div><span data-tx-component="${id}"></span>`
      )
      .join('');
    const refused = await mapPage(html, manifest);
    // Refused standing alone and inside the allowed id it shares a prefix with.
    for (const [id] of known)
      expect(
        refused.filter(([code, source]) => code === 'not-allowed' && source === id)
      ).toHaveLength(2);
  });

  it("passes the composed map through Texuli's mapLockedRenderPage (0.17.2 forwards it)", async () => {
    const html = '<div data-tx-component="data-grid"><button type="button">Sort</button></div>';
    const allow = { 'acme:table': true as const };
    expect(await mapPage(html, { allow })).toEqual([['not-allowed', 'data-grid']]);
    expect(await mapPage(html, { allow, composed: { 'data-grid': 'acme:table' } })).toEqual([]);
  });
});
