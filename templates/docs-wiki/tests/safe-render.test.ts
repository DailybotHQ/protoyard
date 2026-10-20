import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import PageBody from '../src/components/PageBody.svelte';
import { HOSTILE_BODY } from '../src/scenarios/generators.ts';

afterEach(() => cleanup());

describe('page bodies render safely', () => {
  it('shows hostile Markdown as text: no script, image handler, frame or unsafe link', () => {
    render(PageBody, { source: HOSTILE_BODY });
    const region = screen.getByRole('region', { name: 'Page content' });
    expect(region.querySelector('script, iframe, img, object, embed')).toBeNull();
    for (const el of region.querySelectorAll('*')) {
      for (const attr of el.getAttributeNames()) expect(attr.startsWith('on'), attr).toBe(false);
    }
    const hrefs = [...region.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['https://example.com/handbook']);
    // The raw tags are visible as text, exactly as typed.
    expect(region.textContent).toContain('<script>alert("not today")</script>');
    expect(region.textContent).toContain('<img src="x" onerror="alert(1)">');
  });

  it('renders ordinary Markdown structure as elements', () => {
    render(PageBody, { source: '# Runbook\n\n1. **Check** the queue\n2. Restart\n\n`pnpm dev`' });
    const region = screen.getByRole('region', { name: 'Page content' });
    expect(region.querySelector('ol')?.children).toHaveLength(2);
    expect(region.querySelector('strong')?.textContent).toBe('Check');
    expect(region.querySelector('code')?.textContent).toBe('pnpm dev');
  });

  it('says when a page is empty', () => {
    render(PageBody, { source: '' });
    expect(screen.getByText('This page is empty.')).toBeTruthy();
  });
});
