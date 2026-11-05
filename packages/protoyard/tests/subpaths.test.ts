// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Consumers import the capture and static-server APIs from `protoyard`
 * (Dailybot G-004/G-005, Corag G-001): both subpaths are exported and work.
 */
describe('protoyard subpaths', () => {
  it('exports capture and static-server, and serves a built folder', async () => {
    const capture = await import('protoyard/capture');
    expect(typeof capture.capture).toBe('function');
    expect(typeof capture.withReadyPage).toBe('function');
    expect(typeof capture.launchChromium).toBe('function');

    const { serveStatic } = await import('protoyard/static-server');
    const dir = mkdtempSync(join(tmpdir(), 'protoyard-static-'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>ok</title><p>served</p>');
    const server = await serveStatic({ dir, base: '/', port: 0, host: '127.0.0.1' });
    try {
      const response = await fetch(`${server.url}deep/route`);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain('served');
    } finally {
      await server.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
