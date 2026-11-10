import type {
  CatalogExtensionManifest,
  CatalogImportList,
  CatalogReexport,
  ExtensionProp,
  ExtensionState,
} from './types.ts';

/**
 * How the CLI reads `@protoyard/ui` for locked design systems (PLAN_013
 * T-tx015). Data only, three tables, each derived and pinned by the CI gate
 * in `packages/cli/tests/ds-extensions.test.ts`:
 *
 * - {@link PROTOYARD_UI_EXTENSIONS}: one catalog extension manifest per
 *   Protoyard-own component (a `.svelte` file under `packages/ui/src`) that
 *   renders Texuli catalog components: a namespaced id (`protoyard:<kebab>`),
 *   the import that names it and `composes`, the Texuli catalog ids its
 *   implementation renders (through its local children too).
 * - {@link PROTOYARD_UI_REEXPORTS}: every Texuli component `@protoyard/ui`
 *   re-exports, with the Texuli import it is (`FormField` is `Field` from
 *   `texuli/field`). They map to Texuli's own ids; never give one a manifest.
 * - {@link PROTOYARD_UI_NON_COMPONENTS}: own components that render no Texuli
 *   catalog component, only exports Texuli lists as non-components or plain
 *   elements (`SafeArea`). They get no manifest and are classified like the
 *   Texuli exports they render. Since Texuli 0.15.0 the inputs (`ToggleGroup`,
 *   `Rating`, `PinInput`, `TagsInput`, `FileUpload`, `NumberField`) and
 *   `MobileAppFrame` are catalog components, so the wrappers over them have
 *   manifests.
 *
 * Adding a component to `@protoyard/ui`: run that test; its message names the
 * table and the `composes` to write.
 */

const NAMESPACE = 'protoyard';
const MODULE = '@protoyard/ui';
const GROUP = 'protoyard-ui';

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
    group: GROUP,
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
    composes: ['avatar', 'badge'],
  },
  {
    name: 'AdaptiveOverlay',
    label: 'Adaptive overlay',
    summary: 'One overlay that is a dialog or side panel when wide and a bottom sheet on phones.',
    composes: ['detail-panel', 'dialog', 'drawer', 'icon'],
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
    composes: ['avatar'],
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
    composes: ['bottom-nav'],
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
    composes: ['icon', 'icon-button', 'input'],
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
    composes: ['composer'],
    states: ['focus-visible', 'disabled'],
  },
  {
    name: 'DataTable',
    label: 'Data table',
    summary: 'A table with search, sorting, selection, pagination, loading and empty states.',
    composes: [
      'button',
      'checkbox',
      'empty-state',
      'icon',
      'input',
      'pagination',
      'skeleton',
      'table',
    ],
    states: ['loading', 'selected'],
  },
  {
    name: 'DetailPanel',
    label: 'Detail panel',
    summary: 'A side panel that shows one record over the page.',
    composes: ['detail-panel', 'icon'],
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
    composes: ['dropdown-menu', 'dropdown-menu-content', 'dropdown-menu-item', 'icon'],
    states: OVERLAY,
  },
  {
    name: 'EmptyState',
    label: 'Empty state',
    summary: 'An empty-state message with an icon, title and action.',
    composes: ['empty-state', 'icon'],
    props: [enumProp('size', ['sm', 'md'], 'md')],
    axes: { size: 'size' },
  },
  {
    name: 'FilterBar',
    label: 'Filter bar',
    summary: 'Search, enum, relation, boolean and date filters with removable chips.',
    composes: [
      'button',
      'checkbox',
      'icon',
      'input',
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
    composes: ['time-field'],
    states: ['focus-visible', 'disabled', 'selected'],
  },
  {
    name: 'DatePicker',
    label: 'Date picker',
    summary: 'A typed date field with a calendar popover and bounds.',
    composes: ['time-field'],
    states: [...FIELD, 'open'],
  },
  {
    name: 'DateRangePicker',
    label: 'Date range picker',
    summary: 'A typed start and end date with a calendar popover and range rules.',
    composes: ['time-field'],
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
    name: 'EmojiPicker',
    label: 'Emoji picker',
    summary: 'An emoji field with a searchable grouped popover.',
    composes: ['button', 'icon', 'input'],
    states: [...FIELD, 'open'],
  },
  {
    name: 'PasswordStrengthMeter',
    label: 'Password strength meter',
    summary: 'A strength bar and hints for a password value.',
    composes: ['progress'],
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
    composes: ['icon', 'icon-button'],
  },
  {
    name: 'ProposalTag',
    label: 'Proposal tag',
    summary: 'Marks a screen or value as a proposal, not shipped behavior.',
    composes: ['badge', 'icon'],
  },
  {
    name: 'SimulatedTag',
    label: 'Simulated tag',
    summary: 'Marks a feature as simulated (no real backend behind it).',
    composes: ['badge', 'icon'],
  },
  {
    name: 'ImageInput',
    label: 'Image input',
    summary: 'Pick images with previews and removal.',
    composes: ['badge', 'button', 'file-upload', 'icon'],
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
    composes: ['skeleton', 'spinner'],
    states: ['loading'],
    props: [enumProp('variant', ['spinner', 'skeleton'], 'spinner')],
    axes: { variant: 'variant' },
  },
  {
    name: 'MobileHeader',
    label: 'Mobile header',
    summary: 'The phone top bar with title, back and actions.',
    composes: ['mobile-header'],
  },
  {
    name: 'NumberStepper',
    label: 'Number stepper',
    summary: 'A number field with decrement and increment buttons.',
    composes: ['icon', 'number-field'],
    states: FIELD,
  },
  {
    name: 'Notice',
    label: 'Notice',
    summary: 'An inline message with a tone and an icon.',
    composes: ['alert', 'icon'],
    props: [enumProp('tone', ['info', 'success', 'warning', 'error', 'brand'], 'info')],
    axes: { tone: 'tone' },
  },
  {
    name: 'Drawer',
    label: 'Drawer',
    summary: 'A sheet from any edge on the shared overlay stack.',
    composes: ['icon', 'sheet'],
    states: OVERLAY,
  },
  {
    name: 'Pagination',
    label: 'Pagination',
    summary: 'Page numbers with previous and next.',
    composes: ['icon', 'pagination'],
    states: ['focus-visible', 'disabled', 'selected'],
  },
  {
    name: 'Popover',
    label: 'Popover',
    summary: 'Floating content anchored to a trigger.',
    composes: ['popover-content'],
    states: OVERLAY,
  },
  {
    name: 'ScenarioSwitcher',
    label: 'Scenario switcher',
    summary: 'Lists the prototype scenarios and loads one.',
    composes: ['badge', 'button', 'empty-state', 'icon'],
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
    composes: ['icon', 'sidebar'],
    states: ['hover', 'focus-visible', 'selected'],
  },
  {
    name: 'Spinner',
    label: 'Spinner',
    summary: 'An indeterminate loading indicator.',
    composes: ['spinner'],
    states: ['loading'],
  },
  {
    name: 'StatCard',
    label: 'Stat card',
    summary: 'A metric with label, value, delta and trend.',
    composes: ['icon', 'stat'],
  },
  {
    name: 'StatusChip',
    label: 'Status chip',
    summary: 'A status label with a tone.',
    composes: ['badge', 'icon'],
    props: [
      enumProp('tone', ['neutral', 'success', 'warning', 'error', 'info', 'brand'], 'neutral'),
    ],
    axes: { tone: 'tone' },
  },
  {
    name: 'Tabs',
    label: 'Tabs',
    summary: 'Tabs from a list of items, segmented or underlined.',
    composes: ['tabs'],
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
    composes: ['button', 'icon', 'icon-button'],
    states: ACTION,
  },
  {
    name: 'UserPicker',
    label: 'User picker',
    summary: 'Search and pick one or more people, in a popover or inline.',
    composes: ['avatar', 'command-palette', 'icon', 'popover-content'],
    states: [...FIELD, 'open'],
    props: [enumProp('variant', ['popover', 'inline'], 'popover')],
    axes: { variant: 'variant' },
  },
  {
    name: 'WindowChrome',
    label: 'Window chrome',
    summary: 'A simulated desktop window frame around a prototype.',
    composes: ['button', 'icon'],
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
  {
    name: 'ChipGroup',
    label: 'Chip group',
    summary: 'A row of toggle chips for single or multiple choice.',
    composes: ['toggle-group'],
    states: FIELD,
  },
  {
    name: 'FileDropzone',
    label: 'File dropzone',
    summary: 'Drop or pick files with type and size limits.',
    composes: ['file-upload'],
    states: FIELD,
  },
  {
    name: 'WeekdayPicker',
    label: 'Weekday picker',
    summary: 'Toggle the days of the week.',
    composes: ['toggle-group'],
    states: FIELD,
  },
  {
    name: 'TagEmailInput',
    label: 'Tag email input',
    summary: 'Enter email addresses as removable tags.',
    composes: ['tags-input'],
    states: FIELD,
  },
  {
    name: 'MobileAppShell',
    label: 'Mobile app shell',
    summary: 'The phone app frame with header, body and bottom navigation.',
    composes: ['mobile-app-frame'],
  },
  {
    name: 'OtpInput',
    label: 'One-time code input',
    summary: 'Enter a one-time code one character per box.',
    composes: ['pin-input'],
    states: FIELD,
  },
  {
    name: 'StarRating',
    label: 'Star rating',
    summary: 'Show or pick a rating out of a number of stars.',
    composes: ['rating'],
    states: FIELD,
  },
];

/** The `@protoyard/ui` catalog extensions, one per own component that renders Texuli ones. */
export const PROTOYARD_UI_EXTENSIONS: readonly CatalogExtensionManifest[] = ENTRIES.map(manifest);

/**
 * Host chrome: frames and switchers a prototype host draws, not product UI.
 * Every extension is already outside Texuli's emit tiers (`emit: []`, app
 * placement), so host chrome needs no tier of its own; the list names them
 * for docs and tests.
 */
export const PROTOYARD_UI_HOST_CHROME: readonly string[] = [
  'protoyard:browser-chrome',
  'protoyard:layout-host',
  'protoyard:scenario-switcher',
  'protoyard:window-chrome',
];

/** `[name, Texuli module, Texuli export]`; the export defaults to the name. */
const REEXPORTS: readonly (readonly [string, string, string?])[] = [
  ['Accordion', 'texuli/tabs-accordion'],
  ['AppShell', 'texuli/layouts/shells'],
  ['Badge', 'texuli/badge'],
  ['Breadcrumb', 'texuli/navigation'],
  ['Button', 'texuli/button'],
  ['Card', 'texuli/card'],
  ['CardContent', 'texuli/card'],
  ['CardDescription', 'texuli/card'],
  ['CardFooter', 'texuli/card'],
  ['CardGrid', 'texuli/card'],
  ['CardHeader', 'texuli/card'],
  ['CardTitle', 'texuli/card'],
  ['Carousel', 'texuli/carousel'],
  ['ChatThread', '@texuli/chat'],
  ['Checkbox', 'texuli/choice'],
  ['ErrorState', 'texuli/empty'],
  ['FormField', 'texuli/field', 'Field'],
  ['Kbd', 'texuli/kbd-code'],
  ['Label', 'texuli/field'],
  ['MessageList', '@texuli/chat'],
  ['Progress', 'texuli/feedback'],
  ['RadioGroup', 'texuli/choice'],
  ['RadioGroupItem', 'texuli/choice', 'Radio'],
  ['Separator', 'texuli/separator-aspect'],
  ['Skeleton', 'texuli/feedback'],
  ['SplitView', 'texuli/layouts/app/split-view', 'default'],
  ['Stepper', 'texuli/stepper'],
  ['Switch', 'texuli/choice'],
  ['Textarea', 'texuli/input'],
  ['Tooltip', 'texuli/tooltip'],
  ['TypingIndicator', '@texuli/chat'],
  ['VirtualListView', '@texuli/data/virtual-list'],
  ['Wizard', 'texuli/stepper'],
];

/** The Texuli components `@protoyard/ui` re-exports, as the Texuli import each is. */
export const PROTOYARD_UI_REEXPORTS: readonly CatalogReexport[] = REEXPORTS.map(
  ([name, from, exported]) => ({ module: MODULE, name, from, export: exported ?? name })
);

/** Own components that render no Texuli catalog component (see the module comment). */
export const PROTOYARD_UI_NON_COMPONENTS: readonly CatalogImportList[] = [
  {
    module: MODULE,
    exports: ['SafeArea'],
  },
];
