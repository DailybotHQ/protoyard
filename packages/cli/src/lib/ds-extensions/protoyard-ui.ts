import type { CatalogExtensionManifest, ExtensionProp, ExtensionState } from './types.ts';

/**
 * Catalog extension manifests for the Protoyard-own components of
 * `@protoyard/ui` (PLAN_013 T-tx015). Data only: the same shape as a Texuli
 * catalog manifest, with a namespaced id (`protoyard:<kebab>`), the import
 * that names the component and `composes`, the Texuli catalog ids its
 * implementation renders (through its local children too).
 *
 * One entry per Protoyard-own component (a `.svelte` file under
 * `packages/ui/src`). Re-exports of Texuli components (`Button`, `Card`,
 * `Wizard`…) get none: they map to Texuli's own ids.
 * `packages/cli/tests/ds-extensions.test.ts` fails when an own component has
 * no entry, when `composes` drifts from what the source renders, or when an
 * axis value is not in the source.
 *
 * Adding a component to `@protoyard/ui`: add one entry here (copy a similar
 * one), run that test, and fix `composes` from its message.
 */

const NAMESPACE = 'protoyard';
const MODULE = '@protoyard/ui';

const FIELD: readonly ExtensionState[] = ['hover', 'focus-visible', 'disabled', 'invalid'];
const OVERLAY: readonly ExtensionState[] = ['open'];
const ACTION: readonly ExtensionState[] = ['hover', 'focus-visible', 'active', 'disabled'];
const DISPLAY: readonly ExtensionState[] = [];

function enumProp(name: string, values: readonly string[], fallback: string): ExtensionProp {
  return { name, kind: 'enum', enumValues: values, default: fallback };
}

const SIZES_SM_XL = ['sm', 'md', 'lg', 'xl'] as const;

interface Entry {
  name: string;
  label: string;
  summary: string;
  composes: readonly string[];
  states?: readonly ExtensionState[];
  props?: readonly ExtensionProp[];
  axes?: CatalogExtensionManifest['axes'];
}

function kebab(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

function manifest(entry: Entry): CatalogExtensionManifest {
  return {
    id: `${NAMESPACE}:${kebab(entry.name)}`,
    package: MODULE,
    label: entry.label,
    summary: entry.summary,
    tier: 'app',
    agentEmittable: false,
    useWhen: [],
    dontUseWhen: [],
    a11y: [],
    props: entry.props ?? [],
    examples: [],
    ...(entry.axes ? { axes: entry.axes } : {}),
    states: entry.states ?? DISPLAY,
    imports: [{ module: MODULE, exports: [entry.name] }],
    composes: entry.composes,
  };
}

const ENTRIES: readonly Entry[] = [
  {
    name: 'ActorRow',
    label: 'Actor row',
    summary: 'A person, agent or system actor with avatar, name and kind badge.',
    composes: ['badge'],
  },
  {
    name: 'AdaptiveOverlay',
    label: 'Adaptive overlay',
    summary: 'One overlay that is a dialog or side panel when wide and a bottom sheet on phones.',
    composes: ['detail-panel', 'dialog', 'drawer'],
    states: OVERLAY,
    props: [enumProp('size', SIZES_SM_XL, 'md')],
    axes: { size: 'size' },
  },
  {
    name: 'AlertDialog',
    label: 'Alert dialog',
    summary: 'A confirmation dialog on the shared overlay stack, with focus return.',
    composes: ['alert-dialog'],
    states: OVERLAY,
  },
  {
    name: 'Avatar',
    label: 'Avatar',
    summary: 'A person avatar: portrait or initials, with size and status tone.',
    composes: [],
    props: [
      enumProp('size', ['xs', 'sm', 'md', 'lg'], 'md'),
      {
        name: 'tone',
        kind: 'enum',
        enumValues: ['primary', 'success', 'warning', 'destructive', 'info', 'neutral'],
      },
    ],
    axes: { size: 'size' },
  },
  {
    name: 'BottomNav',
    label: 'Bottom navigation',
    summary: 'The phone tab bar of a mobile app shell.',
    composes: [],
    states: ['hover', 'focus-visible', 'selected'],
  },
  {
    name: 'BottomSheet',
    label: 'Bottom sheet',
    summary: 'A drawer from the bottom edge on the shared overlay stack.',
    composes: ['drawer'],
    states: OVERLAY,
  },
  {
    name: 'BrowserChrome',
    label: 'Browser chrome',
    summary: 'A simulated browser frame with an address bar around a prototype.',
    composes: ['icon-button', 'input'],
  },
  {
    name: 'ChipGroup',
    label: 'Chip group',
    summary: 'Single or multiple choice as a row of toggle chips.',
    composes: [],
    states: ['hover', 'focus-visible', 'disabled', 'checked'],
    props: [
      enumProp('size', ['sm', 'md'], 'md'),
      enumProp('variant', ['default', 'outline'], 'default'),
    ],
    axes: { size: 'size', variant: 'variant' },
  },
  {
    name: 'Combobox',
    label: 'Combobox',
    summary: 'A searchable single-value picker from a list of options.',
    composes: ['combobox'],
    states: [...FIELD, 'open'],
  },
  {
    name: 'CommandPalette',
    label: 'Command palette',
    summary: 'A keyboard-first command search dialog.',
    composes: ['command-palette'],
    states: OVERLAY,
  },
  {
    name: 'Composer',
    label: 'Message composer',
    summary: 'The chat message input with send and attachments.',
    composes: [],
    states: ['focus-visible', 'disabled'],
  },
  {
    name: 'DataTable',
    label: 'Data table',
    summary: 'A table with search, sorting, selection, pagination, loading and empty states.',
    composes: ['button', 'checkbox', 'empty-state', 'input', 'pagination', 'table'],
    states: ['loading', 'selected'],
  },
  {
    name: 'DetailPanel',
    label: 'Detail panel',
    summary: 'A side panel that shows one record over the page.',
    composes: ['detail-panel', 'dialog'],
    states: OVERLAY,
    props: [enumProp('size', SIZES_SM_XL, 'md')],
    axes: { size: 'size' },
  },
  {
    name: 'Dialog',
    label: 'Dialog',
    summary: 'A modal dialog on the shared overlay stack, with focus return.',
    composes: ['dialog'],
    states: OVERLAY,
    props: [enumProp('size', SIZES_SM_XL, 'md')],
    axes: { size: 'size' },
  },
  {
    name: 'DropdownMenu',
    label: 'Dropdown menu',
    summary: 'A menu of actions, headings and separators from a trigger.',
    composes: [],
    states: OVERLAY,
  },
  {
    name: 'EmptyState',
    label: 'Empty state',
    summary: 'An empty-state message with an icon, title and action.',
    composes: ['empty-state'],
    props: [enumProp('size', ['sm', 'md'], 'md')],
    axes: { size: 'size' },
  },
  {
    name: 'FileDropzone',
    label: 'File dropzone',
    summary: 'A drop area that accepts files by type and size, with rejections.',
    composes: [],
    states: ['hover', 'focus-visible', 'disabled', 'invalid'],
  },
  {
    name: 'FilterBar',
    label: 'Filter bar',
    summary: 'Search, enum, relation, boolean and date filters with removable chips.',
    composes: [
      'button',
      'checkbox',
      'input',
      'popover',
      'popover-content',
      'select',
      'select-content',
      'select-item',
      'select-trigger',
      'select-viewport',
      'tag',
    ],
  },
  {
    name: 'Calendar',
    label: 'Calendar',
    summary: 'A month calendar to pick one day.',
    composes: [],
    states: ['focus-visible', 'disabled', 'selected'],
  },
  {
    name: 'DatePicker',
    label: 'Date picker',
    summary: 'A typed date field with a calendar popover and bounds.',
    composes: [],
    states: [...FIELD, 'open'],
  },
  {
    name: 'DateRangePicker',
    label: 'Date range picker',
    summary: 'A typed start and end date with a calendar popover and range rules.',
    composes: [],
    states: [...FIELD, 'open'],
  },
  {
    name: 'TimeInput',
    label: 'Time input',
    summary: 'A time-of-day field with minute steps.',
    composes: ['time-field'],
    states: FIELD,
  },
  {
    name: 'TimeZoneSelect',
    label: 'Time zone select',
    summary: 'A searchable IANA time zone picker with UTC offsets.',
    composes: ['combobox'],
    states: [...FIELD, 'open'],
  },
  {
    name: 'WeekdayPicker',
    label: 'Weekday picker',
    summary: 'Pick days of the week as toggle chips.',
    composes: [],
    states: ['focus-visible', 'disabled', 'checked'],
  },
  {
    name: 'EmojiPicker',
    label: 'Emoji picker',
    summary: 'An emoji field with a searchable grouped popover.',
    composes: ['button', 'input'],
    states: [...FIELD, 'open'],
  },
  {
    name: 'PasswordStrengthMeter',
    label: 'Password strength meter',
    summary: 'A strength bar and hints for a password value.',
    composes: [],
  },
  {
    name: 'TagEmailInput',
    label: 'Tag and email input',
    summary: 'Free tags or email addresses as removable tokens.',
    composes: [],
    states: FIELD,
  },
  {
    name: 'TextCounter',
    label: 'Text counter',
    summary: 'A character counter for a text field with a limit.',
    composes: ['text-counter'],
  },
  {
    name: 'Header',
    label: 'Header',
    summary: 'The app shell header with title, actions and the navigation toggle.',
    composes: ['icon-button'],
  },
  {
    name: 'ProposalTag',
    label: 'Proposal tag',
    summary: 'Marks a screen or value as a proposal, not shipped behavior.',
    composes: ['badge'],
  },
  {
    name: 'SimulatedTag',
    label: 'Simulated tag',
    summary: 'Marks a feature as simulated (no real backend behind it).',
    composes: ['badge'],
  },
  {
    name: 'ImageInput',
    label: 'Image input',
    summary: 'Pick images with previews and removal.',
    composes: ['badge', 'button'],
    states: ['hover', 'focus-visible', 'disabled', 'invalid'],
  },
  {
    name: 'Input',
    label: 'Input',
    summary: 'A text input with Protoyard field wiring.',
    composes: ['input'],
    states: FIELD,
  },
  {
    name: 'Kanban',
    label: 'Kanban',
    summary: 'A board of columns and cards with drag and keyboard moves.',
    composes: ['data-board'],
  },
  {
    name: 'LoadingState',
    label: 'Loading state',
    summary: 'A spinner or skeleton placeholder while data loads.',
    composes: [],
    states: ['loading'],
    props: [enumProp('variant', ['spinner', 'skeleton'], 'spinner')],
    axes: { variant: 'variant' },
  },
  {
    name: 'MobileAppShell',
    label: 'Mobile app shell',
    summary: 'The phone app frame: header, content and bottom navigation.',
    composes: [],
  },
  {
    name: 'MobileHeader',
    label: 'Mobile header',
    summary: 'The phone top bar with title, back and actions.',
    composes: [],
  },
  {
    name: 'NumberStepper',
    label: 'Number stepper',
    summary: 'A number field with decrement and increment buttons.',
    composes: [],
    states: FIELD,
  },
  {
    name: 'Notice',
    label: 'Notice',
    summary: 'An inline message with a tone and an icon.',
    composes: ['alert'],
    props: [enumProp('tone', ['info', 'success', 'warning', 'error', 'brand'], 'info')],
    axes: { tone: 'tone' },
  },
  {
    name: 'OtpInput',
    label: 'One-time code input',
    summary: 'A code entered one character per cell.',
    composes: [],
    states: FIELD,
  },
  {
    name: 'Drawer',
    label: 'Drawer',
    summary: 'A sheet from any edge on the shared overlay stack.',
    composes: ['sheet'],
    states: OVERLAY,
  },
  {
    name: 'Pagination',
    label: 'Pagination',
    summary: 'Page numbers with previous and next.',
    composes: ['pagination'],
    states: ['focus-visible', 'disabled', 'selected'],
  },
  {
    name: 'Popover',
    label: 'Popover',
    summary: 'Floating content anchored to a trigger.',
    composes: ['popover', 'popover-content'],
    states: OVERLAY,
  },
  {
    name: 'ScenarioSwitcher',
    label: 'Scenario switcher',
    summary: 'Lists the prototype scenarios and loads one.',
    composes: ['badge', 'button', 'empty-state'],
  },
  {
    name: 'StarRating',
    label: 'Star rating',
    summary: 'A rating from one to five stars, read-only or editable.',
    composes: [],
    states: ['hover', 'focus-visible', 'disabled', 'readonly'],
  },
  {
    name: 'SafeArea',
    label: 'Safe area',
    summary: 'Pads content inside the device safe-area insets.',
    composes: [],
  },
  {
    name: 'Select',
    label: 'Select',
    summary: 'A single-value select from an options list.',
    composes: ['select', 'select-content', 'select-item', 'select-trigger', 'select-viewport'],
    states: [...FIELD, 'open'],
    props: [enumProp('variant', ['outline', 'soft', 'ghost'], 'outline')],
    axes: { variant: 'variant' },
  },
  {
    name: 'Sidebar',
    label: 'Sidebar',
    summary: 'The app shell navigation from sections and items.',
    composes: ['sidebar'],
    states: ['hover', 'focus-visible', 'selected'],
  },
  {
    name: 'Spinner',
    label: 'Spinner',
    summary: 'An indeterminate loading indicator.',
    composes: [],
    states: ['loading'],
  },
  {
    name: 'StatCard',
    label: 'Stat card',
    summary: 'A metric with label, value, delta and trend.',
    composes: ['stat'],
  },
  {
    name: 'StatusChip',
    label: 'Status chip',
    summary: 'A status label with a tone.',
    composes: ['badge'],
    props: [
      enumProp('tone', ['neutral', 'success', 'warning', 'error', 'info', 'brand'], 'neutral'),
    ],
    axes: { tone: 'tone' },
  },
  {
    name: 'Tabs',
    label: 'Tabs',
    summary: 'Tabs from a list of items, segmented or underlined.',
    composes: [],
    states: ['hover', 'focus-visible', 'disabled', 'selected'],
    props: [enumProp('variant', ['segmented', 'underline'], 'segmented')],
    axes: { variant: 'variant' },
  },
  {
    name: 'Toaster',
    label: 'Toaster',
    summary: 'Shows the toast queue.',
    composes: ['toaster'],
  },
  {
    name: 'UndoToaster',
    label: 'Undo toaster',
    summary: 'Shows undoable actions with a countdown.',
    composes: ['button', 'icon-button'],
    states: ACTION,
  },
  {
    name: 'UserPicker',
    label: 'User picker',
    summary: 'Search and pick one or more people, in a popover or inline.',
    composes: ['popover', 'popover-content'],
    states: [...FIELD, 'open'],
    props: [enumProp('variant', ['popover', 'inline'], 'popover')],
    axes: { variant: 'variant' },
  },
  {
    name: 'WindowChrome',
    label: 'Window chrome',
    summary: 'A simulated desktop window frame around a prototype.',
    composes: ['button'],
    props: [enumProp('variant', ['mac-like', 'windows-like'], 'mac-like')],
    axes: { variant: 'variant' },
  },
  {
    name: 'LayoutHost',
    label: 'Layout host',
    summary: 'Renders the prototype layout chosen for the viewport width.',
    composes: ['layout-host'],
  },
  {
    name: 'PageGrid',
    label: 'Page grid',
    summary: 'A responsive grid of cards for a page body.',
    composes: ['card'],
  },
];

/** The `@protoyard/ui` catalog extensions, one per Protoyard-own component. */
export const PROTOYARD_UI_EXTENSIONS: readonly CatalogExtensionManifest[] = ENTRIES.map(manifest);

/**
 * Host chrome: frames and switchers a prototype host draws, not product UI.
 * They move to Texuli's non-emit tier once the catalog names it (drop 2);
 * until then they are `tier: 'app'` with `agentEmittable: false` like the rest.
 */
export const PROTOYARD_UI_HOST_CHROME: readonly string[] = [
  'protoyard:browser-chrome',
  'protoyard:layout-host',
  'protoyard:safe-area',
  'protoyard:scenario-switcher',
  'protoyard:window-chrome',
];
