import { describe, expect, it, vi } from 'vitest';
import { loadCompactIndex, paletteCommands, rankPaletteCommands } from '../src/lib/commands.ts';
import type { CompactEntry } from '../src/lib/types.ts';

function entry(overrides: Partial<CompactEntry> = {}): CompactEntry {
  return {
    k: 'prototype',
    s: 'atlas-crm',
    n: 'Atlas CRM',
    d: 'A customer relationship workspace',
    c: 'Business',
    t: ['sales', 'customer'],
    p: 'desktop',
    st: 'ready',
    tp: null,
    i: null,
    sc: 3,
    m: '2026-10-01T00:00:00Z',
    th: null,
    e: null,
    ...overrides,
  };
}

describe('gallery command palette commands', () => {
  it('offers local start/stop actions only while the control server is available', () => {
    const prototype = entry();
    const local = paletteCommands([prototype], {
      controlAvailable: true,
      runningSlugs: [],
      basePath: '/protoyard/',
    });
    expect(local.find((item) => item.id === 'prototype:atlas-crm:start')?.action).toEqual({
      type: 'server',
      slug: 'atlas-crm',
      operation: 'start',
    });
    expect(local.find((item) => item.id === 'prototype:atlas-crm:device')?.action.type).toBe(
      'open-device'
    );

    const running = paletteCommands([prototype], {
      controlAvailable: true,
      runningSlugs: ['atlas-crm'],
    });
    expect(running.some((item) => item.id === 'prototype:atlas-crm:stop')).toBe(true);
    expect(running.some((item) => item.id === 'prototype:atlas-crm:start')).toBe(false);

    const hosted = paletteCommands([prototype], { controlAvailable: false });
    expect(hosted.some((item) => item.id === 'prototype:atlas-crm:copy-dev')).toBe(true);
    expect(hosted.some((item) => item.id === 'prototype:atlas-crm:start')).toBe(false);
    expect(hosted.find((item) => item.id === 'page:templates')?.action).toEqual({
      type: 'navigate',
      href: '/#templates',
    });
    expect(local.find((item) => item.id === 'page:create')?.action).toEqual({
      type: 'navigate',
      href: '/protoyard/new/',
    });

    const checking = paletteCommands([prototype], { controlAvailable: null });
    expect(checking.some((item) => item.id === 'prototype:atlas-crm:start')).toBe(false);
    expect(checking.some((item) => item.id === 'prototype:atlas-crm:copy-dev')).toBe(false);
  });

  it('includes templates and fuzzy-ranks matching registry metadata', () => {
    const commands = paletteCommands(
      [entry(), entry({ k: 'template', s: 'mobile-app', n: 'Mobile App Starter' })],
      { controlAvailable: false }
    );
    const ranked = rankPaletteCommands(commands, 'atls custmer', 5);
    expect(ranked[0]?.id).toBe('prototype:atlas-crm:open');
    expect(commands.find((item) => item.id === 'template:mobile-app:open')?.action).toEqual({
      type: 'navigate',
      href: '/t/mobile-app/',
    });
    expect(rankPaletteCommands(commands, 'zz-no-match')).toEqual([]);
  });

  it('reads the inline index or fetches it from the gallery home page', async () => {
    const payload = JSON.stringify([entry()]);
    const inlineDoc = document.implementation.createHTMLDocument();
    const script = inlineDoc.createElement('script');
    script.id = 'py-index';
    script.textContent = payload;
    inlineDoc.body.append(script);
    const fetcher = vi.fn();
    await expect(loadCompactIndex(inlineDoc, '/', fetcher as typeof fetch)).resolves.toHaveLength(
      1
    );
    expect(fetcher).not.toHaveBeenCalled();

    const detailDoc = document.implementation.createHTMLDocument();
    const response = new Response(
      `<script id="py-index" type="application/json">${payload}</script>`,
      {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      }
    );
    const homeFetch = vi.fn(async () => response);
    await expect(loadCompactIndex(detailDoc, '/', homeFetch as typeof fetch)).resolves.toHaveLength(
      1
    );
    expect(homeFetch).toHaveBeenCalledWith('/', {
      headers: { accept: 'text/html' },
      cache: 'force-cache',
    });
  });

  it('rejects an unavailable or malformed fetched index instead of inventing commands', async () => {
    const doc = document.implementation.createHTMLDocument();
    const unavailable = vi.fn(async () => new Response('', { status: 503 }));
    await expect(loadCompactIndex(doc, '/', unavailable as typeof fetch)).rejects.toThrow(
      'HTTP 503'
    );

    const malformed = vi.fn(
      async () => new Response('<main>No index here</main>', { status: 200 })
    );
    await expect(loadCompactIndex(doc, '/', malformed as typeof fetch)).rejects.toThrow(
      'did not contain an index'
    );
  });
});
