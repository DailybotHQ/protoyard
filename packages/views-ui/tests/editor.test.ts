import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LinkMenu, MarkdownPreview, RichTextView } from '../src/editor/index.ts';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('preview safety', () => {
  const PAYLOAD = [
    '<script>alert(1)</script>',
    '[click me](javascript:alert(1))',
    '![pixel](data:image/png;base64,AAAA)',
    '<img src=x onerror=alert(1)>',
    '[ok](https://example.com/docs)',
  ].join('\n\n');

  function expectInert(root: HTMLElement) {
    expect(root.querySelector('script')).toBeNull();
    expect(root.querySelector('[onerror]')).toBeNull();
    expect(root.querySelector('img')).toBeNull(); // data: and remote images never load
    const links = [...root.querySelectorAll('a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['https://example.com/docs']);
    expect(links[0]?.getAttribute('rel')).toBe('noreferrer noopener');
    expect(root.textContent).toContain('<script>alert(1)</script>');
    expect(root.textContent).toContain('click me');
  }

  it('renders script, javascript: links and event handlers as inert text', () => {
    render(MarkdownPreview, { source: PAYLOAD, label: 'Preview' });
    expectInert(screen.getByRole('region', { name: 'Preview' }));
  });
});

describe('RichTextView (safe document model)', () => {
  it('rejects unsafe links and keeps the label as text', () => {
    render(RichTextView, {
      value: '[click me](javascript:alert(1))\n\n[safe](https://example.com/docs)',
      label: 'Links',
    });
    const region = screen.getByRole('region', { name: 'Links' });
    const links = [...region.querySelectorAll('a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['https://example.com/docs']);
    expect(region.textContent).toContain('click me');
    expect(region.querySelector('script')).toBeNull();
  });
});

describe('LinkMenu', () => {
  it('applies a safe href and refuses javascript: schemes', async () => {
    const onApply = vi.fn();
    render(LinkMenu, { open: true, href: 'https://', onApply });
    const input = screen.getByRole('textbox', { name: 'Link URL' });
    await fireEvent.input(input, { target: { value: 'javascript:alert(1)' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/http/i);

    await fireEvent.input(input, { target: { value: 'https://example.com/a' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onApply).toHaveBeenCalledWith('https://example.com/a');
  });
});
