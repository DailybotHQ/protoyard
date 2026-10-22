import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  filterSlashCommands,
  LinkMenu,
  MarkdownEditor,
  MarkdownPreview,
  RichTextView,
  slashAt,
} from '../src/editor/index.ts';
import { isMacPlatform } from '../src/lib/platform.ts';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const mod = () => (isMacPlatform() ? { metaKey: true } : { ctrlKey: true });
const PEOPLE = [
  { id: 'u1', value: 'marta.ruiz', label: 'Marta Ruiz', description: 'Design' },
  { id: 'u2', value: 'marco', label: 'Marco Diaz' },
  { id: 'u3', value: 'ana', label: 'Ana Lima' },
];
const RECORDS = [{ id: 'r1', value: 'DEAL-42', label: 'Northwind renewal' }];

function editor(props: Record<string, unknown> = {}) {
  render(MarkdownEditor, { label: 'Comment', ...props });
  return screen.getByRole('textbox', { name: 'Comment' }) as HTMLTextAreaElement;
}

/** Types `text` as the whole value with the caret at `caret` (default: the end). */
async function type(field: HTMLTextAreaElement, text: string, caret = text.length) {
  field.value = text;
  field.setSelectionRange(caret, caret);
  await fireEvent.input(field);
  await tick();
}

function select(field: HTMLTextAreaElement, start: number, end: number) {
  field.focus();
  field.setSelectionRange(start, end);
}

describe('MarkdownEditor toolbar and shortcuts', () => {
  it('formats the selection from the toolbar', async () => {
    const field = editor({ value: 'ship today' });
    select(field, 5, 10);
    await fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
    await waitFor(() => expect(field.value).toBe('ship **today**'));
    expect([field.selectionStart, field.selectionEnd]).toEqual([7, 12]);
    select(field, 0, field.value.length);
    await fireEvent.click(screen.getByRole('button', { name: 'Bulleted list' }));
    await waitFor(() => expect(field.value).toBe('- ship **today**'));
  });

  it('runs shortcuts, and mod+k makes a link without reaching the app palette', async () => {
    const palette = vi.fn();
    window.addEventListener('keydown', palette);
    const field = editor({ value: 'see docs' });
    select(field, 4, 8);
    await fireEvent.keyDown(field, { key: 'i', code: 'KeyI', ...mod() });
    await waitFor(() => expect(field.value).toBe('see _docs_'));
    select(field, 4, 10);
    await fireEvent.keyDown(field, { key: 'k', code: 'KeyK', ...mod() });
    await waitFor(() => expect(field.value).toBe('see [_docs_](https://)'));
    expect(palette).not.toHaveBeenCalled();
    window.removeEventListener('keydown', palette);
  });

  it('continues lists on Enter', async () => {
    const field = editor({ value: '1. first' });
    select(field, 8, 8);
    await fireEvent.keyDown(field, { key: 'Enter', code: 'Enter' });
    await waitFor(() => expect(field.value).toBe('1. first\n2. '));
  });

  it('moves toolbar focus with the arrow keys (one tab stop)', async () => {
    editor();
    const bold = screen.getByRole('button', { name: 'Bold' });
    const italic = screen.getByRole('button', { name: 'Italic' });
    expect(bold.tabIndex).toBe(0);
    expect(italic.tabIndex).toBe(-1);
    bold.focus();
    await fireEvent.keyDown(bold, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(italic);
    expect(bold.getAttribute('aria-keyshortcuts')).toMatch(/^(Command|Control)\+B$/);
  });
});

describe('MarkdownEditor slash commands', () => {
  it('opens on / and applies a heading command', async () => {
    const onChange = vi.fn();
    const field = editor({ value: '', onChange });
    await type(field, '/head');
    const list = screen.getByRole('listbox', { name: 'Commands' });
    expect(list).toBeTruthy();
    const options = screen.getAllByRole('option');
    expect(options.some((option) => option.textContent?.includes('Heading'))).toBe(true);
    await fireEvent.keyDown(field, { key: 'Enter' });
    await waitFor(() => expect(field.value.startsWith('#')).toBe(true));
    expect(onChange).toHaveBeenCalled();
    expect(screen.queryByRole('listbox', { name: 'Commands' })).toBeNull();
  });

  it('filters slash commands and closes on Escape', async () => {
    expect(filterSlashCommands('code').map((c) => c.id)).toContain('code');
    expect(slashAt({ text: 'hello /bu', start: 9, end: 9 })).toEqual({
      start: 6,
      query: 'bu',
    });
    const field = editor({ value: '' });
    await type(field, '/xyzzy');
    // No matching commands → menu closed.
    expect(screen.queryByRole('listbox', { name: 'Commands' })).toBeNull();
    await type(field, '/');
    expect(screen.getByRole('listbox', { name: 'Commands' })).toBeTruthy();
    await fireEvent.keyDown(field, { key: 'Escape' });
    expect(screen.queryByRole('listbox', { name: 'Commands' })).toBeNull();
  });
});

describe('MarkdownEditor completion', () => {
  it('suggests people for @, navigates with arrows and inserts with Enter', async () => {
    const field = editor({ mentions: PEOPLE });
    await type(field, 'hi @mar');
    const list = screen.getByRole('listbox', { name: 'People' });
    const options = screen.getAllByRole('option');
    expect(options.map((o) => o.textContent?.trim().split(/\s+/)[0])).toEqual([
      '@marta.ruiz',
      '@marco',
    ]);
    expect(field.getAttribute('aria-controls')).toBe(list.id);
    expect(field.getAttribute('aria-activedescendant')).toBe(options[0]?.id);
    expect(options[0]?.getAttribute('aria-selected')).toBe('true');
    await fireEvent.keyDown(field, { key: 'ArrowDown' });
    expect(field.getAttribute('aria-activedescendant')).toBe(options[1]?.id);
    await fireEvent.keyDown(field, { key: 'Enter' });
    await waitFor(() => expect(field.value).toBe('hi @marco '));
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(field.hasAttribute('aria-activedescendant')).toBe(false);
  });

  it('suggests records for #, picks with the mouse and closes on Escape', async () => {
    const field = editor({ mentions: PEOPLE, references: RECORDS });
    await type(field, 'see #de');
    expect(screen.getByRole('listbox', { name: 'References' })).toBeTruthy();
    await fireEvent.mouseDown(screen.getByRole('option'));
    await waitFor(() => expect(field.value).toBe('see #DEAL-42 '));
    await type(field, 'cc @an');
    expect(screen.getByRole('listbox')).toBeTruthy();
    await fireEvent.keyDown(field, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    await type(field, 'mail ana@example.com');
    expect(screen.queryByRole('listbox')).toBeNull();
  });
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

  it('is inert in the editor preview tab too', async () => {
    editor({ value: PAYLOAD });
    await fireEvent.click(screen.getByRole('tab', { name: 'Preview' }));
    expectInert(await screen.findByRole('region', { name: 'Comment preview' }));
  });

  it('renders structure as elements', () => {
    render(MarkdownPreview, {
      source: '# Plan\n\n- [x] scope\n- [ ] ship\n\n> quoted **bold**',
      label: 'Preview',
    });
    const region = screen.getByRole('region', { name: 'Preview' });
    expect(region.querySelector('h2')?.textContent).toBe('Plan');
    expect(region.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
    expect(region.querySelector('blockquote strong')?.textContent).toBe('bold');
  });
});

describe('RichTextView (safe document model)', () => {
  it('renders marks, mentions and headings from the editor document', () => {
    render(RichTextView, {
      value: '# Title\n\nHello **world** and @{u1|Ada}\n\n- [x] done',
      label: 'Body',
    });
    const region = screen.getByRole('region', { name: 'Body' });
    expect(region.querySelector('h2')?.textContent).toBe('Title');
    expect(region.querySelector('strong')?.textContent).toBe('world');
    expect(region.textContent).toContain('@Ada');
    expect(region.querySelectorAll('input[type="checkbox"]')).toHaveLength(1);
  });

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

describe('limits, drafts and layout', () => {
  it('enforces the character limit and says so', async () => {
    // Bold adds 4 characters: 12 + 4 would pass the limit of 15.
    const field = editor({ value: 'twelve chars', maxLength: 15 });
    expect(field.getAttribute('maxlength')).toBe('15');
    expect(
      document.getElementById(field.getAttribute('aria-describedby') ?? '')?.textContent?.trim()
    ).toBe('12 / 15');
    select(field, 0, 6);
    await fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
    await waitFor(() =>
      expect(document.body.textContent).toContain('Character limit reached (15).')
    );
    expect(field.value).toBe('twelve chars');
  });

  it('saves drafts after typing pauses, on blur and on unmount', async () => {
    vi.useFakeTimers();
    const onDraft = vi.fn();
    const view = render(MarkdownEditor, { label: 'Comment', onDraft, draftDelayMs: 500 });
    const field = screen.getByRole('textbox', { name: 'Comment' }) as HTMLTextAreaElement;
    await type(field, 'first');
    await vi.advanceTimersByTimeAsync(499);
    expect(onDraft).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onDraft).toHaveBeenLastCalledWith('first');
    await type(field, 'first draft');
    await fireEvent.blur(field);
    expect(onDraft).toHaveBeenLastCalledWith('first draft');
    await type(field, 'first draft, more');
    view.unmount();
    expect(onDraft).toHaveBeenLastCalledWith('first draft, more');
    expect(onDraft).toHaveBeenCalledTimes(3);
  });

  it('shows writing and preview side by side in split layout', async () => {
    const field = editor({ value: '**hi**', layout: 'split' });
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(field).toBeTruthy();
    const preview = await screen.findByRole('region', { name: 'Comment preview' });
    expect(preview.querySelector('strong')?.textContent).toBe('hi');
  });
});
