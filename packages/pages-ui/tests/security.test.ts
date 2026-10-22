/**
 * Page/doc rendering security: no raw HTML injection, unsafe URL schemes
 * stripped, form values never assign prototype pollution keys, and pages-ui
 * source hygiene. AGENTS.md rule 7; docs/SECURITY.md page/doc row.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FormBlock as FormBlockData } from '@protoyard/blocks';
import type { FormServices } from '@protoyard/pages';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { safeHref, safeImageSrc } from '../../ai/src/markdown.ts';
import CardsBlock from '../../blocks-ui/src/structure/CardsBlock.svelte';
import CtaBlock from '../../blocks-ui/src/structure/CtaBlock.svelte';
import MdRenderer from '../../blocks-ui/src/text/MdRenderer.svelte';
import FormBlock from '../src/form/FormBlock.svelte';

afterEach(() => cleanup());

const PAGES_UI_SRC = join(dirname(fileURLToPath(import.meta.url)), '../src');

const FORBIDDEN_SOURCE = [
  { id: 'html-directive', re: /\{@html\b/ },
  { id: 'eval', re: /\beval\s*\(/ },
  { id: 'new-function', re: /\bnew\s+Function\b|\bFunction\s*\(/ },
  { id: 'inner-html', re: /\.innerHTML\s*=/ },
  { id: 'outer-html', re: /\.outerHTML\s*=/ },
  { id: 'insert-adjacent-html', re: /\.insertAdjacentHTML\s*\(/ },
  { id: 'document-write', re: /\bdocument\.write(?:ln)?\s*\(/ },
];

function walkSourceFiles(root: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    const st = statSync(path);
    if (st.isDirectory()) {
      out.push(...walkSourceFiles(path));
      continue;
    }
    if (/\.(ts|svelte|js|css)$/.test(name)) out.push(path);
  }
  return out;
}

const HOSTILE_MARKDOWN = [
  'Hello <script>alert("xss")</script> world',
  '',
  '<img src=x onerror="alert(1)">',
  '',
  '[click](javascript:alert(1))',
  '',
  '[data](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)',
  '',
  '![bad](javascript:alert(1))',
  '',
  '![remote](https://evil.example/track.png)',
  '',
  '[ok](https://example.com/docs)',
  '',
  '![local](./assets/cover.webp)',
].join('\n');

function fakeServices(submit: FormServices['submit']): Pick<FormServices, 'submit'> {
  return { submit };
}

function fixtureForm(fields: FormBlockData['fields']): FormBlockData {
  return {
    type: 'form',
    id: 'sec-form',
    title: 'Contact',
    submitLabel: 'Send',
    successMessage: 'Thanks.',
    fields,
  };
}

describe('pages-ui source hygiene', () => {
  it('contains no raw HTML injection or eval patterns', () => {
    const files = walkSourceFiles(PAGES_UI_SRC);
    expect(files.length).toBeGreaterThan(5);
    const hits: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const rule of FORBIDDEN_SOURCE) {
        if (rule.re.test(text)) {
          hits.push(`${file.replace(PAGES_UI_SRC, 'src')}: ${rule.id}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it('never uses the {@html} directive (gate companion)', () => {
    const files = walkSourceFiles(PAGES_UI_SRC);
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      expect(text.includes('{@html'), file).toBe(false);
    }
  });
});

describe('safeHref / safeImageSrc (page/doc URL policy)', () => {
  it('strips javascript: and data: hrefs', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('JAVASCRIPT:alert(1)')).toBeNull();
    expect(safeHref('data:text/html,<script>')).toBeNull();
    expect(safeHref('vbscript:msgbox(1)')).toBeNull();
    expect(safeHref('//evil.example/x')).toBeNull();
    expect(safeHref('https://example.com/docs')).toBe('https://example.com/docs');
    expect(safeHref('mailto:team@example.com')).toBe('mailto:team@example.com');
    expect(safeHref('#section')).toBe('#section');
    expect(safeHref('./path')).toBe('./path');
  });

  it('allows only relative image sources through safeImageSrc', () => {
    expect(safeImageSrc('javascript:alert(1)')).toBeNull();
    expect(safeImageSrc('data:image/png;base64,AAAA')).toBeNull();
    expect(safeImageSrc('https://evil.example/x.png')).toBeNull();
    expect(safeImageSrc('#hash')).toBeNull();
    expect(safeImageSrc('./assets/cover.webp')).toBe('./assets/cover.webp');
    expect(safeImageSrc('assets/cover.webp')).toBe('assets/cover.webp');
  });
});

describe('rich text rendering (MdRenderer used by page/doc text blocks)', () => {
  it('shows raw HTML as literal text and never injects script or handlers', () => {
    const view = render(MdRenderer, { props: { source: HOSTILE_MARKDOWN } });
    const root = view.container;

    expect(root.querySelector('script, iframe, object, embed')).toBeNull();
    for (const el of root.querySelectorAll('*')) {
      for (const attr of el.getAttributeNames()) {
        expect(attr.startsWith('on'), `${el.tagName}.${attr}`).toBe(false);
      }
    }

    // Hostile tags stay visible as text content.
    expect(root.textContent).toContain('<script>alert("xss")</script>');
    expect(root.textContent).toContain('<img src=x onerror="alert(1)">');

    const hrefs = [...root.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['https://example.com/docs']);
    expect(hrefs.every((h) => h && !/^javascript:/i.test(h) && !/^data:/i.test(h))).toBe(true);

    const srcs = [...root.querySelectorAll('img')].map((img) => img.getAttribute('src'));
    expect(srcs).toEqual(['./assets/cover.webp']);
    expect(srcs.every((s) => s && !/^javascript:/i.test(s) && !/^data:/i.test(s))).toBe(true);
  });
});

describe('structure blocks strip unsafe hrefs', () => {
  it('CtaBlock drops javascript: and data: actions', () => {
    const view = render(CtaBlock, {
      props: {
        block: {
          type: 'cta',
          title: 'Try it',
          actions: [
            { label: 'Bad js', href: 'javascript:alert(1)', variant: 'primary' },
            { label: 'Bad data', href: 'data:text/html,hi', variant: 'secondary' },
            { label: 'Docs', href: 'https://example.com/docs', variant: 'primary' },
            { label: 'Anchor', href: '#next', variant: 'link' },
          ],
        },
      },
    });
    // Unsafe schemes never become href attributes (external https is a button).
    const hrefs = [...view.container.querySelectorAll('[href]')].map((el) =>
      el.getAttribute('href')
    );
    expect(hrefs.every((h) => h && !/^(javascript|data|vbscript):/i.test(h))).toBe(true);
    expect(hrefs).toContain('#next');
    expect(view.queryByRole('button', { name: 'Bad js' })).toBeNull();
    expect(view.queryByRole('button', { name: 'Bad data' })).toBeNull();
    expect(view.getByRole('button', { name: 'Docs' })).toBeTruthy();
    expect(view.getByRole('link', { name: 'Anchor' })).toBeTruthy();
  });

  it('CardsBlock only links safe hrefs', () => {
    const view = render(CardsBlock, {
      props: {
        block: {
          type: 'cards',
          items: [
            { title: 'Safe', href: 'https://example.com/a', body: 'ok' },
            { title: 'Evil', href: 'javascript:alert(1)', body: 'no' },
            { title: 'Plain', body: 'no link' },
          ],
        },
      },
    });
    const hrefs = [...view.container.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['https://example.com/a']);
  });
});

describe('FormBlock prototype pollution', () => {
  it('never assigns __proto__, constructor or prototype on submit values', async () => {
    const fields = [
      { name: 'fullName', label: 'Full name', type: 'text' as const, required: true },
      { name: '__proto__', label: 'Proto', type: 'text' as const },
      { name: 'constructor', label: 'Ctor', type: 'text' as const },
      { name: 'prototype', label: 'ProtoType', type: 'text' as const },
    ];
    const form = fixtureForm(fields as FormBlockData['fields']);
    const submit = vi.fn().mockResolvedValue({ id: 'response-1' });
    const view = render(FormBlock, {
      props: { form, services: fakeServices(submit) },
    });

    // Unsafe fields are not rendered as controls.
    expect(view.queryByLabelText('Proto')).toBeNull();
    expect(view.queryByLabelText('Ctor')).toBeNull();
    expect(view.queryByLabelText('ProtoType')).toBeNull();

    await fireEvent.input(view.getByRole('textbox', { name: 'Full name' }), {
      target: { value: 'Ada Example' },
    });
    await fireEvent.click(view.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(submit).toHaveBeenCalled());

    const submitted = submit.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(Object.hasOwn(submitted, '__proto__')).toBe(false);
    expect(Object.hasOwn(submitted, 'constructor')).toBe(false);
    expect(Object.hasOwn(submitted, 'prototype')).toBe(false);
    expect(Object.getPrototypeOf(submitted)).toBe(Object.prototype);
    expect(submitted.fullName).toBe('Ada Example');
  });

  it('ignores pollution keys injected through validation issue maps', async () => {
    const form = fixtureForm([
      { name: 'fullName', label: 'Full name', type: 'text', required: true },
    ]);
    const submit = vi.fn().mockRejectedValue({
      issues: {
        fullName: 'Too short',
        __proto__: 'pollute',
        constructor: 'pollute',
      },
    });
    const view = render(FormBlock, {
      props: { form, services: fakeServices(submit) },
    });
    await fireEvent.input(view.getByRole('textbox', { name: 'Full name' }), {
      target: { value: 'Ada Example' },
    });
    await fireEvent.click(view.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(view.getByText('Too short')).toBeTruthy());
    // Error bag must not become a polluted object prototype.
    expect(Object.getPrototypeOf(Object.prototype)).toBe(null);
  });
});
