import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { setFacet } from '@protoyard/views/grid';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Segments from '../src/activity/Segments.svelte';
import { LinkMenu, MarkdownEditor } from '../src/editor/index.ts';
import { ColumnChooser, DataGrid, FacetPicker, FilterChips } from '../src/grid/index.ts';
import { NotificationCenter } from '../src/notifications/index.ts';
import { SettingsLayout } from '../src/settings/index.ts';
import { OutlineEditor } from '../src/tree/index.ts';

afterEach(() => cleanup());

/**
 * A Texuli Button defaults to the solid primary variant. Controls styled as
 * quiet text (muted or foreground text, a list row, a card) must say so with a
 * variant, or they render primary-filled and fail AA contrast.
 */
function expectQuiet(element: Element | null, variant: 'ghost' | 'outline' = 'ghost') {
  expect(element, 'control is rendered').toBeTruthy();
  const classes = (element as Element).classList;
  expect(classes.contains('tx-button--default'), (element as Element).outerHTML).toBe(false);
  expect(classes.contains(`tx-button--${variant}`), (element as Element).outerHTML).toBe(true);
}

describe('views-ui quiet buttons are never primary-filled', () => {
  it('MarkdownEditor: write/preview tabs and the formatting toolbar are ghost', () => {
    render(MarkdownEditor, { label: 'Comment', layout: 'tabs' });
    expectQuiet(screen.getByRole('tab', { name: 'Write' }));
    expectQuiet(screen.getByRole('tab', { name: 'Preview' }));
    const toolbar = screen.getByRole('toolbar', { name: 'Formatting for Comment' });
    const tools = toolbar.querySelectorAll('button');
    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) expectQuiet(tool);
  });

  it('MarkdownEditor: the slash command glyph is hidden from assistive tech', async () => {
    render(MarkdownEditor, { label: 'Comment', value: '' });
    const field = screen.getByRole('textbox', { name: 'Comment' }) as HTMLTextAreaElement;
    field.focus();
    field.value = '/head';
    field.setSelectionRange(5, 5);
    await fireEvent.input(field);
    const list = await screen.findByRole('listbox', { name: 'Commands' });
    const option = Array.from(list.querySelectorAll('[role="option"]')).find((node) =>
      node.textContent?.includes('Heading')
    ) as HTMLElement;
    expect(option).toBeTruthy();
    const glyph = option.querySelector('span');
    expect(glyph?.getAttribute('aria-hidden')).toBe('true');
  });

  it('LinkMenu: Remove is outline and Cancel is ghost (Apply stays primary)', () => {
    render(LinkMenu, { open: true, href: 'https://example.com', onRemove: vi.fn() });
    expectQuiet(screen.getByRole('button', { name: 'Remove' }), 'outline');
    expectQuiet(screen.getByRole('button', { name: 'Cancel' }));
  });

  it('OutlineEditor: the empty-state create button is ghost', async () => {
    render(OutlineEditor<{ id: string; parentId: string | null; rank: string; title: string }>, {
      query: { current: [], loading: false, error: undefined },
      getId: (n) => n.id,
      getParentId: (n) => n.parentId,
      getRank: (n) => n.rank,
      getTitle: (n) => n.title,
      onCreate: vi.fn(async () => 'new'),
      onRename: vi.fn(async () => {}),
      onMove: vi.fn(async () => {}),
    });
    expectQuiet(await screen.findByRole('button', { name: /Add the first item/ }));
  });

  it('OutlineEditor: the bullet glyph is decorative and the Move to… trigger is ghost', async () => {
    render(OutlineEditor<{ id: string; parentId: string | null; rank: string; title: string }>, {
      query: {
        current: [{ id: 'a', parentId: null, rank: 'a0', title: 'Docs' }],
        loading: false,
        error: undefined,
      },
      getId: (n) => n.id,
      getParentId: (n) => n.parentId,
      getRank: (n) => n.rank,
      getTitle: (n) => n.title,
      onCreate: vi.fn(async () => 'new'),
      onRename: vi.fn(async () => {}),
      onMove: vi.fn(async () => {}),
    });
    const input = await screen.findByDisplayValue('Docs');
    const row = input.closest('li') as HTMLElement;
    const bullet = Array.from(row.querySelectorAll('span')).find((s) => s.textContent === '•');
    expect(bullet?.getAttribute('aria-hidden')).toBe('true');
    expectQuiet(screen.getByRole('button', { name: 'Move Docs to…' }));
  });

  it('FacetPicker: "Clear <column>" is ghost', async () => {
    const column = {
      key: 'stage',
      header: 'Stage',
      type: 'enum' as const,
      options: ['Lead', 'Won'],
    };
    render(FacetPicker, {
      column: column as never,
      value: setFacet(null, 'stage', ['Lead']),
      onchange: vi.fn(),
    });
    await fireEvent.click(screen.getByRole('button', { name: /Stage/ }));
    expectQuiet(await screen.findByRole('button', { name: 'Clear Stage' }));
  });

  it('ColumnChooser move buttons and FilterChips remove buttons are ghost', () => {
    const columns = [
      { key: 'name', header: 'Name', type: 'text' as const },
      { key: 'stage', header: 'Stage', type: 'enum' as const, options: ['Lead', 'Won'] },
    ];
    render(ColumnChooser, { columns: columns as never, value: [], onchange: vi.fn() });
    expectQuiet(screen.getByRole('button', { name: 'Move Name down' }));
    expectQuiet(screen.getByRole('button', { name: 'Move Stage up' }));
    cleanup();
    render(FilterChips, {
      columns: columns as never,
      value: setFacet(null, 'stage', ['Lead']),
      onchange: vi.fn(),
    });
    expectQuiet(screen.getByRole('button', { name: /^Remove filter:/ }));
  });

  it('Segments: a reference link is ghost, not primary text on a primary fill', () => {
    render(Segments, {
      segments: [{ type: 'reference', id: 'r1', label: 'DEAL-42', missing: false }] as never,
      onOpenReference: vi.fn(),
    });
    expectQuiet(screen.getByRole('button', { name: '#DEAL-42' }));
  });

  it('DataGrid phone cards wrap and read as text, not a primary pill', async () => {
    render(DataGrid<{ id: string; name: string }>, {
      query: { current: [{ id: '1', name: 'Acme' }], loading: false, error: undefined },
      columns: [{ key: 'name', header: 'Name', type: 'text' as const }] as never,
      getRowId: (r) => r.id,
      caption: 'Deals',
      onRowOpen: vi.fn(),
    });
    const card = await waitFor(() => {
      const node = document.querySelector('ul[aria-label="Deals"] li button');
      expect(node).toBeTruthy();
      return node as HTMLElement;
    });
    expectQuiet(card);
    expect(card.className).toMatch(/\bwhitespace-normal\b/);
    expect(card.className).toMatch(/\btext-left\b/);
  });

  it('NotificationCenter rows and SettingsLayout sections are ghost', async () => {
    render(NotificationCenter, {
      query: {
        current: [
          {
            id: 'n1',
            kind: 'mention',
            title: 'Marta mentioned you in a long thread title that should wrap',
            subjectId: 't1',
            at: '2026-10-19T10:00:00Z',
            readAt: null,
          },
        ],
        loading: false,
        error: undefined,
      },
      now: '2026-10-19T12:00:00Z',
      onMarkRead: vi.fn(async () => true),
      onMarkAllRead: vi.fn(async () => 1),
    });
    await fireEvent.click(screen.getByRole('button', { name: /Notifications$/ }));
    // Rows are Texuli's inbox (G50); the mute action stays a quiet ghost Button.
    expectQuiet(screen.getByRole('button', { name: 'Mute mention' }));
    cleanup();
    const { createRawSnippet } = await import('svelte');
    render(SettingsLayout, {
      sections: [{ id: 'profile', label: 'Profile' }],
      children: createRawSnippet(() => ({ render: () => '<p>Body</p>' })),
    });
    expectQuiet(screen.getByRole('button', { name: /Profile/ }));
  });
});

/** Every default-variant `<Button>` left in the source, by file (intentional primaries only). */
const PRIMARY_ALLOWED: Record<string, number> = {
  'activity/Composer.svelte': 1, // "Comment" submit
  'editor/LinkMenu.svelte': 1, // "Apply"
  'grid/SavedViews.svelte': 1, // "Save" / "Rename"
  'lib/LazyDropdownMenu.svelte': 2, // trigger props come from the caller
  'lib/LazyPopover.svelte': 2, // trigger props come from the caller
  'settings/SaveBar.svelte': 1, // "Save changes"
};

function svelteFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return svelteFiles(path);
    return path.endsWith('.svelte') ? [path] : [];
  });
}

/** Opening `<Button …>` tags, skipping `>` inside `{…}` expressions. */
function buttonTags(source: string): string[] {
  const tags: string[] = [];
  for (const match of source.matchAll(/<Button\b/g)) {
    let depth = 0;
    let end = match.index + match[0].length;
    for (; end < source.length; end += 1) {
      const char = source[end];
      if (char === '{') depth += 1;
      else if (char === '}') depth -= 1;
      else if (char === '>' && depth === 0) break;
    }
    tags.push(source.slice(match.index, end));
  }
  return tags;
}

describe('views-ui Button variants (source guard)', () => {
  it('only intentional primaries use the default variant', () => {
    const root = join(import.meta.dirname, '../src');
    const found: Record<string, number> = {};
    for (const file of svelteFiles(root)) {
      const count = buttonTags(readFileSync(file, 'utf8')).filter(
        (tag) => !/\bvariant\b/.test(tag)
      ).length;
      if (count) found[relative(root, file).split('\\').join('/')] = count;
    }
    expect(found).toEqual(PRIMARY_ALLOWED);
  });
});
