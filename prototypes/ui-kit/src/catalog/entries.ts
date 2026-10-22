/**
 * Catalog metadata without any Svelte imports, so the seed generator and
 * tests can use it in plain Node. Demos + snippets live in `registry.ts`.
 */

export const CATALOG_GROUPS = [
  { id: 'forms', name: 'Forms', description: 'Inputs, choices and field wiring.' },
  { id: 'overlays', name: 'Overlays', description: 'Dialogs, menus, popovers, sheets.' },
  {
    id: 'navigation',
    name: 'Navigation',
    description: 'Tabs, carousels, accordions, breadcrumbs, paging.',
  },
  { id: 'feedback', name: 'Feedback', description: 'Toasts, progress and page states.' },
  { id: 'display', name: 'Display', description: 'Badges, avatars, cards and stats.' },
  { id: 'data', name: 'Data', description: 'Tables and boards.' },
  {
    id: 'charts',
    name: 'Charts',
    description: 'Every @protoyard/charts-ui family, states and a stress test.',
  },
  { id: 'views', name: 'Views', description: 'Rich, interactive product views.' },
  { id: 'layout', name: 'Layout', description: 'App shell, sidebar and header.' },
  { id: 'chat', name: 'Chat', description: 'Threads, composer and people pickers.' },
  { id: 'flows', name: 'Flows', description: 'Steppers and wizards.' },
  { id: 'mobile', name: 'Mobile', description: 'Bottom nav, mobile header, safe areas.' },
  { id: 'patterns', name: 'Patterns', description: 'Whole screens composed from the kit.' },
] as const;

export type CatalogGroupId = (typeof CATALOG_GROUPS)[number]['id'];

export interface CatalogEntryMeta {
  id: string;
  name: string;
  group: CatalogGroupId;
  summary: string;
}

const e = (group: CatalogGroupId, id: string, name: string, summary: string): CatalogEntryMeta => ({
  id,
  name,
  group,
  summary,
});

const viewEntries: CatalogEntryMeta[] = (
  [
    ['board', 'Board'],
    ['calendar', 'Calendar'],
    ['timeline', 'Timeline'],
    ['grid', 'Data grid'],
    ['tree', 'Tree and outline'],
    ['map', 'Map'],
    ['editor', 'Markdown editor'],
    ['activity', 'Comments and activity'],
    ['notifications', 'Notifications'],
    ['files', 'Files'],
    ['settings', 'Settings'],
    ['states', 'Query states'],
    ['commands', 'Command palette'],
  ] as const
).map(([id, name]) => e('views', id, name, 'Interactive rich view demo.'));

export const CATALOG: readonly CatalogEntryMeta[] = [
  e('forms', 'button', 'Button', 'Six variants, four sizes, loading and link rendering.'),
  e('forms', 'input', 'Input', 'Text input with invalid and disabled states.'),
  e('forms', 'textarea', 'Textarea', 'Multi-line text input.'),
  e('forms', 'label', 'Label', 'Accessible label for any control.'),
  e('forms', 'form-field', 'FormField', 'Label + description + error, wired with aria.'),
  e('forms', 'checkbox', 'Checkbox', 'Checked, unchecked and indeterminate.'),
  e('forms', 'radio-group', 'RadioGroup', 'One choice from a short list.'),
  e('forms', 'switch', 'Switch', 'Instant on/off settings.'),
  e('forms', 'select', 'Select', 'Pick one option from a list.'),
  e('forms', 'combobox', 'Combobox', 'Searchable select for long lists.'),
  e('overlays', 'dialog', 'Dialog', 'Modal for focused tasks.'),
  e('overlays', 'alert-dialog', 'AlertDialog', 'Confirm destructive actions.'),
  e('overlays', 'dropdown-menu', 'DropdownMenu', 'Action menus with icons and separators.'),
  e('overlays', 'popover', 'Popover', 'Non-modal floating content.'),
  e('overlays', 'tooltip', 'Tooltip', 'Short hints for icon buttons.'),
  e('overlays', 'detail-panel', 'DetailPanel', 'Side sheet for record details.'),
  e('overlays', 'bottom-sheet', 'BottomSheet', 'Mobile sheet with swipe to dismiss.'),
  e('navigation', 'tabs', 'Tabs', 'Switch between views of the same context.'),
  e('navigation', 'carousel', 'Carousel', 'Slides with dots, arrows, keys and swipe.'),
  e('navigation', 'accordion', 'Accordion', 'Progressive disclosure of sections.'),
  e('navigation', 'breadcrumb', 'Breadcrumb', 'Where am I in the hierarchy.'),
  e('navigation', 'pagination', 'Pagination', 'Numbered paging with ellipses.'),
  e('feedback', 'toast', 'Toast', 'Transient success, error and info messages.'),
  e('feedback', 'progress', 'Progress', 'Determinate progress with a label.'),
  e('feedback', 'skeleton', 'Skeleton', 'Placeholder while content loads.'),
  e('feedback', 'spinner', 'Spinner', 'Indeterminate activity.'),
  e('feedback', 'empty-state', 'EmptyState', 'Nothing here yet — and what to do.'),
  e('feedback', 'error-state', 'ErrorState', 'Something failed — with retry.'),
  e('feedback', 'loading-state', 'LoadingState', 'A whole region is loading.'),
  e('display', 'badge', 'Badge', 'Status and category labels.'),
  e('display', 'avatar', 'Avatar', 'Initials with deterministic colors.'),
  e('display', 'card', 'Card', 'Grouped content with header and footer.'),
  e('display', 'separator', 'Separator', 'Visual division between groups.'),
  e('display', 'kbd', 'Kbd', 'Keyboard shortcuts.'),
  e('display', 'stat-card', 'StatCard', 'A metric with trend.'),
  e('display', 'card-grid', 'CardGrid', 'Responsive grid of cards.'),
  e('data', 'data-table', 'DataTable', 'Sort, search, filter, paginate, row click.'),
  e('data', 'kanban', 'Kanban', 'Columns with drag and drop and a move menu.'),
  e('charts', 'chart-cartesian', 'Cartesian charts', 'Line, area, bar, combo and scatter.'),
  e('charts', 'chart-part-whole', 'Part-whole charts', 'Donut, pie, funnel, Sankey and treemap.'),
  e('charts', 'chart-matrix', 'Matrix charts', 'Heatmaps, calendar heatmap and histogram.'),
  e('charts', 'chart-compact', 'Compact charts', 'Sparklines, gauges and radial progress.'),
  e('charts', 'chart-geo', 'Tile maps', 'Equal-area tile maps for regions.'),
  e(
    'charts',
    'chart-states',
    'Chart states',
    'Loading, empty, error, light/dark and reduced motion.'
  ),
  e('charts', 'chart-stress', 'Chart stress test', '10,000 points with an SVG/Canvas toggle.'),
  ...viewEntries,
  e('layout', 'app-shell', 'AppShell', 'Sidebar + header + main with a mobile drawer.'),
  e('layout', 'sidebar', 'Sidebar', 'Collapsible navigation with sections and badges.'),
  e('layout', 'header', 'Header', 'Page title, description and actions.'),
  e('chat', 'chat-thread', 'ChatThread', 'Message list + typing + composer.'),
  e('chat', 'message-list', 'MessageList', 'Grouped messages with own-message alignment.'),
  e('chat', 'composer', 'Composer', 'Enter to send, Shift+Enter for a new line.'),
  e('chat', 'typing-indicator', 'TypingIndicator', 'Who is typing, reduced-motion safe.'),
  e('chat', 'user-picker', 'UserPicker', 'Pick a person with search.'),
  e('flows', 'stepper', 'Stepper', 'Progress through ordered steps.'),
  e('flows', 'wizard', 'Wizard', 'Multi-step form with validation.'),
  e('mobile', 'bottom-nav', 'BottomNav', 'Thumb-reachable tabs with badges.'),
  e('mobile', 'mobile-header', 'MobileHeader', 'Back action, title and actions.'),
  e('mobile', 'safe-area', 'SafeArea', 'Respect notches and home indicators.'),
  e('patterns', 'pattern-dashboard', 'SaaS dashboard', 'AppShell, stats and a data table.'),
  e('patterns', 'pattern-kanban', 'Task board', 'Kanban with a detail panel.'),
  e('patterns', 'pattern-chat', 'Team chat', 'Conversations and a live thread.'),
  e(
    'patterns',
    'pattern-mobile',
    'Mobile app',
    'Mobile header, list, bottom sheet and bottom nav.'
  ),
];

export const CATALOG_IDS: readonly string[] = CATALOG.map((entry) => entry.id);

/**
 * Ids the seed generator may pick as favorites: everything before the charts
 * group was added, so existing scenarios generate the same rows as before.
 */
export const FAVORITE_CANDIDATE_IDS: readonly string[] = CATALOG.filter(
  (entry) => entry.group !== 'charts'
).map((entry) => entry.id);

export function catalogEntry(id: string): CatalogEntryMeta | undefined {
  return CATALOG.find((entry) => entry.id === id);
}
