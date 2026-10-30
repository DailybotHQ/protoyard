import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { createRawSnippet, flushSync, tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as ui from '../src/index.ts';
import ContractHarness from './fixtures/ContractHarness.svelte';

/**
 * Texuli's uniform component contract, applied to every `@protoyard/ui`
 * component export: `bind:ref` gives the component's root element (for an
 * overlay, its open content); the caller's rest attributes land on that root,
 * or on the focusable control inside it (Texuli's form controls route them
 * there); and the caller's handlers run on that element, composed with the
 * component's own (caller first, as in Texuli).
 *
 * Every component export needs a row below, so a new export cannot skip the
 * contract. A row with `texuliGap` names a Texuli component that does not
 * take the contract yet (Texuli gap G93): its test is expected to fail until Texuli ships the
 * fix, and then it must be removed.
 */

const text = (value: string) => createRawSnippet(() => ({ render: () => `<span>${value}</span>` }));

interface Case {
  props?: Record<string, unknown>;
  /** Props that receive a generic snippet (a button spreading trigger props). */
  snippets?: readonly string[];
  inRadioGroup?: boolean;
  /** An open Texuli gap: the re-exported Texuli component lacks the contract. */
  texuliGap?: string;
}

const user = { id: 'u1', name: 'Ada Example' };
const option = { value: 'a', label: 'Alpha' };

const CASES: Record<string, Case> = {
  Accordion: { props: { items: [{ value: 'a', title: 'Alpha', content: 'Body' }] } },
  ActorRow: { props: { actor: { name: 'Ada Example', kind: 'person' } } },
  AdaptiveOverlay: { props: { open: true, title: 'Panel', children: text('Body') } },
  AlertDialog: { props: { open: true, title: 'Delete record?' } },
  AppShell: {
    props: { children: text('Main') },
    texuliGap: 'texuli/layouts/shells AppShell has no ref',
  },
  Avatar: { props: { name: 'Ada Example' } },
  Badge: { props: { children: text('New') } },
  BottomNav: { props: { items: [{ label: 'Home', href: '#/' }] } },
  BottomSheet: { props: { open: true, title: 'Sheet', children: text('Body') } },
  Breadcrumb: { props: { items: [{ label: 'Home', href: '#/' }, { label: 'Page' }] } },
  BrowserChrome: { props: { origin: 'https://app.example.com', children: text('Page') } },
  Button: { props: { children: text('Save') } },
  Calendar: {},
  Card: { props: { children: text('Body') } },
  CardContent: { props: { children: text('Body') } },
  CardDescription: { props: { children: text('Body') } },
  CardFooter: { props: { children: text('Body') } },
  CardGrid: { props: { children: text('Body') } },
  CardHeader: { props: { children: text('Body') } },
  CardTitle: { props: { children: text('Body') } },
  Carousel: {
    props: { items: [{ id: 'a', label: 'Slide A' }], label: 'Gallery' },
    snippets: ['children'],
  },
  ChatThread: { props: { messages: [] }, texuliGap: '@texuli/chat ChatThread has no ref' },
  Checkbox: { props: { label: 'Accept' } },
  ChipGroup: { props: { items: [option], label: 'Kind' } },
  Combobox: { props: { items: [option], label: 'Kind' } },
  CommandPalette: { props: { open: true, search: async () => [], onSelect: () => {} } },
  Composer: {
    props: { onSubmit: () => {} },
    texuliGap: '@texuli/chat Composer has no ref and drops rest attributes',
  },
  DataTable: {
    props: {
      columns: [{ key: 'name', header: 'Name' }],
      rows: [{ id: '1', name: 'Ada' }],
      getRowId: (row: { id: string }) => row.id,
      caption: 'People',
    },
  },
  DatePicker: { props: { label: 'Due' } },
  DateRangePicker: { props: { label: 'Period' } },
  DetailPanel: { props: { open: true, title: 'Details', children: text('Body') } },
  Dialog: { props: { open: true, title: 'Edit', children: text('Body') } },
  Drawer: { props: { open: true, title: 'Filters', children: text('Body') } },
  DropdownMenu: {
    props: { open: true, items: [{ label: 'Rename', onSelect: () => {} }] },
    snippets: ['trigger'],
  },
  EmojiPicker: { props: { label: 'Emoji' } },
  EmptyState: { props: { title: 'Nothing here' } },
  ErrorState: { props: { title: 'Failed', message: 'Try again' } },
  FileDropzone: { props: { label: 'Files' } },
  FilterBar: {
    props: { fields: [{ id: 'kind', label: 'Kind', kind: 'enum', options: [option] }] },
  },
  FormField: { props: { label: 'Name', children: text('Control') } },
  Header: { props: { title: 'Inbox' } },
  ImageInput: { props: { label: 'Photo' } },
  Input: { props: { 'aria-label': 'Name' } },
  Kanban: {
    props: {
      columns: [{ id: 'todo', title: 'To do' }],
      items: [{ id: '1', column: 'todo', title: 'Task' }],
      getColumn: (item: { column: string }) => item.column,
      getItemId: (item: { id: string }) => item.id,
      getItemLabel: (item: { title: string }) => item.title,
      onMove: () => {},
    },
    snippets: ['card'],
    texuliGap: '@texuli/data/board Board has no ref and drops rest attributes',
  },
  Kbd: { props: { children: text('K') } },
  Label: { props: { children: text('Name') } },
  LayoutHost: { props: { layout: 'custom', children: text('Screen') } },
  LoadingState: {},
  MessageList: {
    props: { messages: [] },
    texuliGap: '@texuli/chat MessageList drops rest attributes',
  },
  MobileAppShell: {
    props: { children: text('Screen') },
    texuliGap: 'texuli/layouts/mobile MobileAppFrame has no ref or rest',
  },
  MobileHeader: { props: { title: 'Inbox' } },
  Notice: { props: { title: 'Heads up', children: text('Body') } },
  NumberStepper: { props: { label: 'Seats' } },
  OtpInput: { props: { label: 'Code' } },
  PageGrid: { props: { children: text('Cards') } },
  Pagination: { props: { pageCount: 3 } },
  PasswordStrengthMeter: { props: { value: 'secret', label: 'Strength' } },
  Popover: { props: { open: true, children: text('Body') }, snippets: ['trigger'] },
  Progress: { props: { value: 40, label: 'Upload' } },
  ProposalTag: {},
  RadioGroup: { props: { 'aria-label': 'Plan', items: [option] } },
  RadioGroupItem: { props: { value: 'a', label: 'Alpha' }, inRadioGroup: true },
  SafeArea: { props: { children: text('Body') } },
  ScenarioSwitcher: { props: { groups: [] } },
  Select: { props: { items: [option], label: 'Kind' } },
  Separator: {},
  Sidebar: { props: { items: [{ label: 'Home', href: '#/' }] } },
  SimulatedTag: {},
  Skeleton: {},
  Spinner: {},
  SplitView: { snippets: ['list', 'detail'], texuliGap: 'texuli/layouts/app SplitView has no ref' },
  StarRating: { props: { label: 'Rating', value: 3 } },
  StatCard: { props: { label: 'Revenue', value: '$1,000' } },
  StatusChip: { props: { label: 'Active' } },
  Stepper: { props: { steps: [{ id: 'a', label: 'Alpha' }] } },
  Switch: { props: { label: 'Enabled' } },
  Tabs: { props: { items: [{ value: 'a', label: 'Alpha' }], label: 'Sections' } },
  TagEmailInput: { props: { label: 'Invite' } },
  TextCounter: { props: { value: 'abc', maxlength: 10, label: 'Bio' } },
  Textarea: { props: { 'aria-label': 'Notes' } },
  TimeInput: { props: { label: 'At' } },
  TimeZoneSelect: { props: { label: 'Time zone' } },
  Toaster: {},
  Tooltip: { props: { content: 'Hint', open: true }, snippets: ['children'] },
  TypingIndicator: {
    props: { names: ['Ada'] },
    texuliGap: '@texuli/chat TypingIndicator has no ref',
  },
  UndoToaster: {},
  UserPicker: { props: { users: [user], label: 'Assignee' } },
  WeekdayPicker: { props: { label: 'Days' } },
  WindowChrome: { props: { title: 'App', children: text('Window') } },
  Wizard: { props: { steps: [{ id: 'a', label: 'Alpha' }] }, snippets: ['content'] },
};

function isComponent(value: unknown): boolean {
  return typeof value === 'function' && /\$\$anchor|\$\$props/.test(String(value));
}

const components = Object.entries(ui).filter(([, value]) => isComponent(value));

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

describe('@protoyard/ui component contract', () => {
  it('has a contract row for every component export', () => {
    const exported = components.map(([name]) => name).sort();
    expect(exported.length).toBeGreaterThan(80);
    expect(Object.keys(CASES).sort()).toEqual(exported);
  });

  for (const [name, component] of components) {
    const row = CASES[name] ?? {};
    const test = row.texuliGap ? it.fails : it;
    const suffix = row.texuliGap ? ` (Texuli gap G93: ${row.texuliGap})` : '';
    test(`${name}: bind:ref names the root, rest attributes and caller handlers land on it${suffix}`, async () => {
      const onclick = vi.fn();
      let ref: unknown = null;
      render(ContractHarness, {
        props: {
          component: component as never,
          props: { ...row.props, 'data-contract': name, onclick },
          snippets: row.snippets ?? [],
          inRadioGroup: row.inRadioGroup ?? false,
          onRef: (value: unknown) => {
            ref = value;
          },
        },
      });
      flushSync();
      await tick();

      expect(ref, 'bind:ref gives an element').toBeInstanceOf(HTMLElement);
      const root = ref as HTMLElement;
      const target = document.querySelector<HTMLElement>(`[data-contract="${name}"]`);
      expect(target, 'rest attributes reach the DOM').not.toBeNull();
      expect(
        target === root || root.contains(target),
        'rest attributes land on the ref or the control inside it'
      ).toBe(true);
      await fireEvent.click(target as HTMLElement);
      expect(onclick, 'the caller handler runs there').toHaveBeenCalledTimes(1);
    });
  }
});

describe('handler composition', () => {
  it('runs the caller handler first, then the component’s own (Checkbox, Switch)', async () => {
    for (const component of [ui.Checkbox, ui.Switch]) {
      const order: string[] = [];
      let ref: HTMLElement | null = null;
      render(ContractHarness, {
        props: {
          component: component as never,
          props: {
            label: 'Enabled',
            'data-control': '',
            onclick: (event: MouseEvent) =>
              order.push(
                `caller:${(event.currentTarget as HTMLElement).getAttribute('aria-checked') ?? ''}`
              ),
            onCheckedChange: (checked: boolean) => order.push(`own:${checked}`),
          },
          onRef: (value: unknown) => {
            ref = value as HTMLElement;
          },
        },
      });
      flushSync();
      expect(ref).toBeInstanceOf(HTMLElement);
      await fireEvent.click(document.querySelector('[data-control]') as HTMLElement);
      expect(order[0]?.startsWith('caller:')).toBe(true);
      expect(order).toContain('own:true');
      cleanup();
    }
  });

  it('keeps the component’s own handling when the caller handles the same event (Input)', async () => {
    const oninput = vi.fn();
    let ref: HTMLInputElement | null = null;
    render(ContractHarness, {
      props: {
        component: ui.Input as never,
        props: { 'aria-label': 'Name', value: '', oninput },
        onRef: (value: unknown) => {
          ref = value as HTMLInputElement;
        },
      },
    });
    flushSync();
    const input = ref as unknown as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'Ada' } });
    expect(oninput).toHaveBeenCalledTimes(1);
    expect(input.value).toBe('Ada');
  });
});
