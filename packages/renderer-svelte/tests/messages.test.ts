import { PermissionDeniedError, SimulatedServiceError } from '@protoyard/core';
import { AppShell, MobileAppShell, toast } from '@protoyard/ui';
import { cleanup, render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  chromeMessages,
  DEFAULT_CHROME_MESSAGES,
  formatMessage,
  messageParts,
  mountPrototype,
  NotFound,
  reportServiceError,
  resolveChromeMessages,
  setChromeMessages,
} from '../src/index.ts';
import { SHELL_CSS_MARKER } from '../src/shell/frames/registry.ts';
import StaleWorldNotice from '../src/shell/StaleWorldNotice.svelte';
import StorageBanner from '../src/shell/StorageBanner.svelte';
import { createFakeRuntime } from './fixtures/fake-runtime.ts';
import ProbeApp from './fixtures/ProbeApp.svelte';

/*
 * Chrome strings come from `mountPrototype({ messages })` (renderer) and
 * `skipLabel` (ui shells), with English as the default, so a prototype can
 * ship in any language.
 */

const SPANISH = {
  service: {
    notAllowedTitle: 'No permitido',
    notAllowedDescription: 'Tu rol no puede hacer esto ({capability}).',
    offline: 'Sin conexión',
    unexpectedTitle: 'Algo salió mal',
  },
  router: {
    notFoundTitle: 'Página no encontrada',
    notFoundBody: 'No hay nada en {path} en este prototipo.',
    home: 'Ir al inicio',
  },
  storage: { title: 'Los cambios no se guardarán.', dismiss: 'Cerrar aviso' },
  staleWorld: {
    rebuilt: 'Los datos se reconstruyeron desde el escenario {scenario} (semilla {seed}).',
    rebuiltLabel: 'Datos reconstruidos',
    dismiss: 'Cerrar',
  },
  badge: { text: 'Prototipo · datos simulados' },
} as const;

afterEach(() => {
  cleanup();
  setChromeMessages();
  vi.restoreAllMocks();
});

describe('resolveChromeMessages', () => {
  it('defaults to English and merges any subset', () => {
    expect(resolveChromeMessages()).toEqual(DEFAULT_CHROME_MESSAGES);
    const merged = resolveChromeMessages(SPANISH);
    expect(merged.service.notAllowedTitle).toBe('No permitido');
    expect(merged.service.timeout).toBe(DEFAULT_CHROME_MESSAGES.service.timeout);
    expect(merged.boot).toEqual(DEFAULT_CHROME_MESSAGES.boot);
    // The defaults are never mutated.
    expect(DEFAULT_CHROME_MESSAGES.service.notAllowedTitle).toBe('Not allowed');
  });

  it('rejects unknown keys, empty or non-string values and over-long text', () => {
    const bad: unknown[] = [
      { services: {} },
      { service: { notAlowedTitle: 'typo' } },
      { service: { notAllowedTitle: '' } },
      { service: { notAllowedTitle: '   ' } },
      { service: { notAllowedTitle: 42 } },
      { service: 'No permitido' },
      { service: { notAllowedTitle: 'x'.repeat(501) } },
      JSON.parse('{"__proto__":{"polluted":"yes"}}'),
      JSON.parse('{"service":{"__proto__":"x"}}'),
    ];
    for (const input of bad) {
      expect(() => resolveChromeMessages(input as never), JSON.stringify(input)).toThrow(TypeError);
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('is what chromeMessages() returns after setChromeMessages()', () => {
    setChromeMessages(SPANISH);
    expect(chromeMessages().router.home).toBe('Ir al inicio');
    setChromeMessages();
    expect(chromeMessages().router.home).toBe('Go to the start page');
  });
});

describe('formatMessage and messageParts', () => {
  it('fills placeholders as text and marks the filled values', () => {
    expect(formatMessage('Nothing lives at {path}.', { path: '/x' })).toBe('Nothing lives at /x.');
    expect(messageParts('{name} at {path}!', { name: 'A', path: '/b' })).toEqual([
      { text: 'A', value: 'name' },
      { text: ' at ' },
      { text: '/b', value: 'path' },
      { text: '!' },
    ]);
  });

  it('keeps unknown placeholders and never interprets values', () => {
    expect(formatMessage('Hi {who}', {})).toBe('Hi {who}');
    expect(formatMessage('{x}', { x: '<img src=x onerror=alert(1)>' })).toBe(
      '<img src=x onerror=alert(1)>'
    );
    expect(formatMessage('{toString}', {})).toBe('{toString}');
  });
});

describe('service error toasts', () => {
  it('use English by default and the configured messages after setChromeMessages', () => {
    const error = vi.spyOn(toast, 'error');
    reportServiceError(new PermissionDeniedError('deals:delete', 'viewer'));
    expect(error).toHaveBeenLastCalledWith('Not allowed', {
      description:
        "Your role can't do this (deals:delete). Switch persona in DevTools to try another role.",
    });
    setChromeMessages(SPANISH);
    reportServiceError(new PermissionDeniedError('deals:delete', 'viewer'));
    expect(error).toHaveBeenLastCalledWith('No permitido', {
      description: 'Tu rol no puede hacer esto (deals:delete).',
    });
    reportServiceError(new SimulatedServiceError('offline', 'deals.create'));
    expect(error.mock.lastCall?.[0]).toBe('Sin conexión');
    reportServiceError(new SimulatedServiceError('timeout', 'deals.create'));
    expect(error.mock.lastCall?.[0]).toBe('Request timed out');
    reportServiceError(new Error('boom'));
    expect(error.mock.lastCall?.[0]).toBe('Algo salió mal');
    reportServiceError(new Error('boom'), { errorTitle: 'Explicit title' });
    expect(error.mock.lastCall?.[0]).toBe('Explicit title');
  });
});

describe('chrome components', () => {
  it('router fallback reads the messages, with the path as text', () => {
    setChromeMessages(SPANISH);
    render(NotFound, { path: '/<b>nope</b>' });
    expect(screen.getByRole('heading', { name: 'Página no encontrada' })).toBeTruthy();
    const code = screen.getByText('/<b>nope</b>');
    expect(code.tagName).toBe('CODE');
    expect(code.closest('p')?.textContent).toBe('No hay nada en /<b>nope</b> en este prototipo.');
    expect(screen.getByRole('link', { name: 'Ir al inicio' })).toBeTruthy();
  });

  it('router fallback stays English without messages', () => {
    render(NotFound, { path: '/nope' });
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeTruthy();
  });

  it('storage and stale-world banners read the messages', () => {
    setChromeMessages(SPANISH);
    render(StorageBanner, { storage: { persistent: false } as never });
    expect(screen.getByText('Los cambios no se guardarán.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cerrar aviso' })).toBeTruthy();
    cleanup();
    const runtime = createFakeRuntime();
    render(StaleWorldNotice, {
      runtime,
      stale: { scenario: 'empty', seed: 7, status: 'reseeded', reason: 'older generators' },
    });
    const region = screen.getByRole('region', { name: 'Datos reconstruidos' });
    expect(region.textContent).toMatch(
      /Los datos se reconstruyeron desde el escenario .+ \(semilla 7\)\./
    );
    expect(region.querySelector('strong')?.textContent).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cerrar' })).toBeTruthy();
  });
});

describe('mountPrototype({ messages })', () => {
  let destroy: (() => Promise<void>) | undefined;
  beforeEach(() => {
    document.documentElement.style.setProperty(SHELL_CSS_MARKER, '1');
  });
  afterEach(async () => {
    await destroy?.();
    destroy = undefined;
    document.body.replaceChildren();
    document.documentElement.removeAttribute('style');
    localStorage.clear();
  });

  async function boot(messages?: unknown) {
    const runtime = createFakeRuntime();
    const target = document.body.appendChild(document.createElement('div'));
    const mounted = await mountPrototype({
      definition: runtime.definition,
      App: ProbeApp,
      target,
      search: '',
      devtools: false,
      demoBadge: true,
      createRuntime: () => runtime,
      ...(messages !== undefined ? { messages: messages as never } : {}),
    });
    destroy = mounted.destroy;
    return mounted;
  }

  it('applies the messages to the mounted chrome', async () => {
    const mounted = await boot(SPANISH);
    expect(mounted.error).toBeNull();
    expect(chromeMessages().badge.text).toBe('Prototipo · datos simulados');
    await new Promise((r) => setTimeout(r, 20));
    const badge = document.querySelector('[data-py-demo-badge]');
    expect(badge?.textContent).toContain('Prototipo · datos simulados');
  });

  it('keeps English when no messages are given, even after a translated mount', async () => {
    await boot(SPANISH);
    await destroy?.();
    destroy = undefined;
    document.body.replaceChildren();
    await boot();
    expect(chromeMessages().badge.text).toBe('Prototype · simulated data');
  });

  it('shows a boot error, in English, for an invalid messages option', async () => {
    const mounted = await boot({ service: { notAlowedTitle: 'typo' } });
    expect(mounted.runtime).toBeNull();
    expect(String(mounted.error)).toMatch(/Unknown message "service\.notAlowedTitle"/);
    expect(document.body.textContent).toContain("couldn't start");
    expect(chromeMessages()).toEqual(DEFAULT_CHROME_MESSAGES);
  });
});

describe('shell skip links', () => {
  const children = createRawSnippet(() => ({ render: () => '<p>content</p>' }));

  it('AppShell and MobileAppShell default to English and take skipLabel', () => {
    render(AppShell, { children });
    expect(screen.getByRole('link', { name: 'Skip to content' })).toBeTruthy();
    cleanup();
    render(AppShell, { children, skipLabel: 'Saltar al contenido' });
    expect(screen.getByRole('link', { name: 'Saltar al contenido' })).toBeTruthy();
    cleanup();
    render(MobileAppShell, { children, skipLabel: 'Aller au contenu' });
    expect(screen.getByRole('link', { name: 'Aller au contenu' })).toBeTruthy();
  });
});
