import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Device and window frames paint only theme tokens (Dailybot G-062): a check of
 * computed colors against the compiled theme must find nothing foreign around a
 * framed app. Palette utilities (zinc, black, white), literal colors and opacity
 * modifiers (`bg-surface/70`, which compiles to color-mix) are all refused.
 */
const FRAMES = [
  'shell/frames/PhoneFrame.svelte',
  'shell/frames/TabletFrame.svelte',
  'shell/frames/DeviceFrame.svelte',
  'shell/frames/DesktopWindowFrame.svelte',
  'shell/frames/BrowserFrame.svelte',
  'shell/frames/StatusBar.svelte',
  'shell/frames/HomeIndicator.svelte',
  'shell/FullScreenToggle.svelte',
  'shell/FullScreenExit.svelte',
];

const FOREIGN = [
  /\b(?:bg|text|border|ring|fill|stroke|shadow|outline|from|to|via)-(?:black|white|zinc|slate|neutral|gray|stone)\b/,
  /\b(?:bg|text|border|ring|fill|stroke|outline)-[a-z-]+\/\d+/,
  /#[0-9a-fA-F]{3,8}\b/,
  /\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/,
  /color-mix\(/,
];

const source = (path: string) => readFileSync(join(import.meta.dirname, '../src', path), 'utf8');

describe('frame colors come from theme tokens (G-062)', () => {
  it.each(FRAMES)('%s uses no palette or literal colors', (path) => {
    const text = source(path);
    for (const pattern of FOREIGN) expect(text, `${path} ${pattern}`).not.toMatch(pattern);
  });

  it('paints the stage from the muted token, never color-mix', () => {
    const css = source('app.css');
    const shellRules = css.slice(css.indexOf('html[data-py-shell] #app {'));
    expect(shellRules.slice(0, 2000)).toContain('background: var(--color-muted)');
    expect(shellRules.slice(0, 2000)).not.toMatch(/color-mix\(/);
  });
});
