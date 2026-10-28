import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { applyTheme } from '@texuli/tokens';
import { loadLibraryTheme } from '@texuli/tokens/library';
import { afterEach, describe, expect, it } from 'vitest';
import TexuliLinkProbe from './fixtures/texuli-link/TexuliLinkProbe.svelte';

/**
 * Texuli is installed from npm (exact versions in package.json, ADR-045). A
 * Protoyard screen imports a Texuli component, a texel and the tokens from the
 * published `dist/`, and Vitest compiles and runs them like workspace code.
 */

afterEach(() => cleanup());

const workspace = resolve(import.meta.dirname, '../../..');

describe('Texuli from npm in Protoyard: test', () => {
  it('resolves every Texuli package to the published version in the pnpm store', () => {
    const declared = JSON.parse(readFileSync(resolve(workspace, 'package.json'), 'utf8')).devDependencies;
    for (const name of ['@texuli/core', '@texuli/primitives', '@texuli/tokens', 'texuli']) {
      const real = realpathSync(resolve(workspace, 'node_modules', name));
      expect(real.startsWith(realpathSync(resolve(workspace, 'node_modules/.pnpm'))), name).toBe(true);
      const manifest = JSON.parse(readFileSync(resolve(real, 'package.json'), 'utf8'));
      expect(manifest.version, name).toBe(declared[name]);
      expect(existsSync(resolve(real, 'dist')), name).toBe(true);
    }
  });

  it('mounts a Texuli Button from a Protoyard screen, and it works', async () => {
    render(TexuliLinkProbe);
    const button = screen.getByRole('button', { name: 'Save draft' });
    expect(button.className).toContain('tx-button');
    await fireEvent.click(button);
    await fireEvent.click(button);
    expect(document.querySelector('[data-clicks]')?.textContent).toBe('2');
    expect(screen.getByRole('link', { name: 'Help' }).getAttribute('href')).toBe(
      'https://example.com/help'
    );
  });

  it('runs the Texuli URL policy from the screen', () => {
    render(TexuliLinkProbe, { props: { href: 'javascript:alert(1)' } });
    expect(screen.queryByRole('link')).toBeNull();
    expect(document.querySelector('[data-blocked-link]')?.textContent).toBe('Help');
  });

  it('applies a Texuli library theme to a Protoyard document', async () => {
    const theme = await loadLibraryTheme('enterprise-neutral');
    const applied = applyTheme(document.documentElement, { theme, mode: 'dark' });
    expect(applied.themeId).toBe(theme.id);
    expect(document.documentElement.dataset.txTheme).toBe(theme.id);
    expect(document.documentElement.style.length).toBeGreaterThan(10);
  });
});
