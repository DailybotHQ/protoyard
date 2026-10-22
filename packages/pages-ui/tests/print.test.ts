import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PRINT_ROOT_CLASS, PRINT_UI_SUBPATH, PrintButton } from '../src/print/index.ts';

const css = readFileSync(join(import.meta.dirname, '../src/print/print.css'), 'utf8');
const styles = readFileSync(join(import.meta.dirname, '../src/styles.css'), 'utf8');

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** happy-dom has no print dialog: install a spy as `window.print`. */
function stubPrint() {
  const print = vi.fn();
  Object.defineProperty(window, 'print', { configurable: true, writable: true, value: print });
  return print;
}

/** The stylesheet without comments, and what lies outside its top-level `@media print` block. */
function split(text: string): { body: string; outside: string } {
  const plain = text.replace(/\/\*[\s\S]*?\*\//g, '');
  const start = plain.indexOf('@media print');
  if (start < 0) return { body: '', outside: plain };
  const open = plain.indexOf('{', start);
  let depth = 0;
  let end = open;
  for (let i = open; i < plain.length; i++) {
    if (plain[i] === '{') depth++;
    else if (plain[i] === '}' && --depth === 0) {
      end = i;
      break;
    }
  }
  return {
    body: plain.slice(open + 1, end),
    outside: plain.slice(0, start) + plain.slice(end + 1),
  };
}

describe('print stylesheet', () => {
  const { body, outside } = split(css);

  it('keeps every rule inside @media print, @page included', () => {
    expect(body).not.toBe('');
    expect(outside.trim()).toBe('');
    expect(body).toMatch(/@page\s*\{[^}]*margin:/);
  });

  it('hides chrome that is not content', () => {
    for (const selector of [
      '.py-devtools',
      '[data-py-demo-badge]',
      '[data-py-review-toolbar]',
      '[role="progressbar"]',
      '[data-py-print-hide]',
      '[data-py-print-button]',
      '[data-py-page-nav]',
      '.docs-layout__navigation',
      '.docs-layout__toc',
    ]) {
      expect(body, selector).toContain(selector);
    }
    expect(body).toMatch(/display:\s*none\s*!important/);
  });

  it('applies to the page and doc hosts and the opt-in root class', () => {
    expect(body).toContain('[data-py-page-host]');
    expect(body).toContain('[data-py-doc-host]');
    expect(body).toContain(`.${PRINT_ROOT_CLASS}`);
  });

  it('prints external link targets and avoids breaking cards, figures and tables', () => {
    expect(body).toMatch(/a\[href\^=["']http["']\][^{]*::after\s*\{[^}]*attr\(href\)/);
    expect(body).toMatch(/\[data-py-block\], figure, table[^{]*\{[^}]*break-inside:\s*avoid/);
    expect(body).toMatch(/h1, h2, h3, h4\)\s*\{[^}]*break-after:\s*avoid/);
  });

  it('is part of the kit stylesheet so hosts print without extra imports', () => {
    expect(styles).toContain('@import "./print/print.css";');
  });
});

describe('PrintButton', () => {
  it('has a visible label and calls window.print once per click', async () => {
    const print = stubPrint();
    render(PrintButton);
    const button = screen.getByRole('button', { name: 'Print' });
    expect(button.textContent?.trim()).toBe('Print');
    expect(button.hasAttribute('data-py-print-button')).toBe(true);
    expect(button.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    await fireEvent.click(button);
    expect(print).toHaveBeenCalledTimes(1);
    await fireEvent.click(button);
    expect(print).toHaveBeenCalledTimes(2);
  });

  it('takes a custom label', () => {
    stubPrint();
    render(PrintButton, { label: 'Print report' });
    expect(screen.getByRole('button', { name: 'Print report' })).toBeTruthy();
    expect(PRINT_UI_SUBPATH).toBe('print');
  });
});
