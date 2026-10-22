// Utilities and shared types

export { default as Accordion } from './components/accordion/Accordion.svelte';
export type { AccordionItem } from './components/accordion/types.ts';
export { default as AlertDialog } from './components/alert-dialog/AlertDialog.svelte';
// Layout & navigation
export { default as AppShell } from './components/app-shell/AppShell.svelte';
export {
  type AppShellContext,
  getAppShellContext,
} from './components/app-shell/context.ts';
export { default as Avatar } from './components/avatar/Avatar.svelte';
// Display
export { default as Badge } from './components/badge/Badge.svelte';
export { type BadgeVariant, badgeVariants } from './components/badge/badge-variants.ts';
// Mobile
export { default as BottomNav } from './components/bottom-nav/BottomNav.svelte';
export { default as BottomSheet } from './components/bottom-sheet/BottomSheet.svelte';
export { default as Breadcrumb } from './components/breadcrumb/Breadcrumb.svelte';
export type { BreadcrumbItem } from './components/breadcrumb/types.ts';
export { formatAddress, parseAddress } from './components/browser-chrome/address.ts';
export { default as BrowserChrome } from './components/browser-chrome/BrowserChrome.svelte';
// Primitives
export { default as Button } from './components/button/Button.svelte';
export {
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
  buttonVariants,
} from './components/button/button-variants.ts';
export { default as Card } from './components/card/Card.svelte';
export { default as CardContent } from './components/card/CardContent.svelte';
export { default as CardDescription } from './components/card/CardDescription.svelte';
export { default as CardFooter } from './components/card/CardFooter.svelte';
export { default as CardHeader } from './components/card/CardHeader.svelte';
export { default as CardTitle } from './components/card/CardTitle.svelte';
export { default as CardGrid } from './components/card-grid/CardGrid.svelte';
// Collaboration
export { default as ChatThread } from './components/chat/ChatThread.svelte';
export { groupMessages, type MessageGroup } from './components/chat/group-messages.ts';
export { default as MessageList } from './components/chat/MessageList.svelte';
export type {
  ChatAuthor,
  ChatMessage,
  ChatMessageStatus,
} from './components/chat/types.ts';
export { default as Checkbox } from './components/checkbox/Checkbox.svelte';
export { default as Combobox } from './components/combobox/Combobox.svelte';
export { default as CommandPalette } from './components/command-palette/CommandPalette.svelte';
export type {
  CommandPaletteItem,
  CommandPaletteSearch,
  CommandPaletteSelect,
} from './components/command-palette/types.ts';
export { default as Composer } from './components/composer/Composer.svelte';
// Data
export { default as DataTable } from './components/data-table/DataTable.svelte';
export { compareValues, sortRows } from './components/data-table/table-utils.ts';
export type {
  DataTableColumn,
  DataTableSort,
  SortDirection,
  SortValue,
} from './components/data-table/types.ts';
export { default as DetailPanel } from './components/detail-panel/DetailPanel.svelte';
// Overlays
export { default as Dialog } from './components/dialog/Dialog.svelte';
export { default as DropdownMenu } from './components/dropdown-menu/DropdownMenu.svelte';
export type {
  DropdownMenuAction,
  DropdownMenuEntry,
  DropdownMenuHeading,
  DropdownMenuSeparator,
} from './components/dropdown-menu/types.ts';
export { default as EmptyState } from './components/empty-state/EmptyState.svelte';
export { default as ErrorState } from './components/error-state/ErrorState.svelte';
export { formatBytes, matchesAccept, validateFiles } from './components/file-dropzone/accept.ts';
export { default as FileDropzone } from './components/file-dropzone/FileDropzone.svelte';
export type { DropzoneFile, DropzoneReject } from './components/file-dropzone/types.ts';
export {
  applyFilters,
  buildFilterChips,
  clearFilterChip,
  hasActiveFilters,
  isFilterActive,
  readFilterValue,
  resetFilterValues,
  setListFilterValue,
} from './components/filter-bar/apply-filters.ts';
export { default as FilterBar } from './components/filter-bar/FilterBar.svelte';
export type {
  BooleanFilterField,
  DateRangeFilterField,
  DateRangeFilterValue,
  EnumFilterField,
  FilterChip,
  FilterField,
  FilterOption,
  FilterValue,
  FilterValues,
  RelationFilterField,
} from './components/filter-bar/types.ts';
export { default as FormField } from './components/form-field/FormField.svelte';
export type { FormFieldControl } from './components/form-field/form-field.ts';
export { default as Header } from './components/header/Header.svelte';
export { default as Input } from './components/input/Input.svelte';
export { default as Kanban } from './components/kanban/Kanban.svelte';
export type { KanbanColumn } from './components/kanban/types.ts';
export { default as Kbd } from './components/kbd/Kbd.svelte';
export { default as Label } from './components/label/Label.svelte';
export { default as LoadingState } from './components/loading-state/LoadingState.svelte';
export { default as MobileAppShell } from './components/mobile-app-shell/MobileAppShell.svelte';
export { default as MobileHeader } from './components/mobile-header/MobileHeader.svelte';
export { default as Drawer } from './components/overlay/Drawer.svelte';
export {
  DEFAULT_DRAWER_SIZE,
  DRAWER_PLACEMENTS,
  type DrawerPlacement,
  resolveDrawerSize,
} from './components/overlay/drawer.ts';
export {
  OVERLAY_Z_BASE,
  type OverlayEntry,
  OverlayStack,
  overlayStack,
  type PushOverlayOptions,
  type RestoreFocusOptions,
} from './components/overlay/overlay-stack.ts';
export {
  type OverlayLayer,
  type OverlayLayerOptions,
  useOverlayLayer,
  useOverlayTopZIndex,
} from './components/overlay/use-overlay-layer.svelte.ts';
export { default as Pagination } from './components/pagination/Pagination.svelte';
export { getPageTokens, type PageToken } from './components/pagination/pages.ts';
export { default as Popover } from './components/popover/Popover.svelte';
export { default as Progress } from './components/progress/Progress.svelte';
export { default as RadioGroup } from './components/radio-group/RadioGroup.svelte';
export { default as RadioGroupItem } from './components/radio-group/RadioGroupItem.svelte';
export type { RadioOption } from './components/radio-group/types.ts';
export { default as SafeArea } from './components/safe-area/SafeArea.svelte';
export { default as Select } from './components/select/Select.svelte';
export type { SelectOption } from './components/select/types.ts';
export { default as Separator } from './components/separator/Separator.svelte';
export { default as Sidebar } from './components/sidebar/Sidebar.svelte';
export type { SidebarItem, SidebarSection } from './components/sidebar/types.ts';
export { default as Skeleton } from './components/skeleton/Skeleton.svelte';
export { default as Spinner } from './components/spinner/Spinner.svelte';
export { default as StatCard } from './components/stat-card/StatCard.svelte';
export {
  formatDelta,
  resolveTrend,
  type Trend,
  trendTone,
  trendWord,
} from './components/stat-card/trend.ts';
// Flows
export { default as Stepper } from './components/stepper/Stepper.svelte';
export type { StepperStep } from './components/stepper/types.ts';
export { default as Switch } from './components/switch/Switch.svelte';
// Disclosure
export { default as Tabs } from './components/tabs/Tabs.svelte';
export type { TabItem } from './components/tabs/types.ts';
export { default as Textarea } from './components/textarea/Textarea.svelte';
// Feedback
export { default as Toaster } from './components/toast/Toaster.svelte';
export {
  MAX_TOASTS,
  type ToastAction,
  type ToastAnnouncement,
  type ToastItem,
  type ToastKind,
  type ToastOptions,
  type ToastStore,
  toast,
} from './components/toast/toast.svelte.ts';
export { default as UndoToaster } from './components/toast/UndoToaster.svelte';
export {
  DEFAULT_UNDO_DURATION,
  MAX_UNDO_DURATION,
  MAX_UNDO_TOASTS,
  MIN_UNDO_DURATION,
  type UndoAnnouncement,
  type UndoSettleReason,
  type UndoToastItem,
  type UndoToastOptions,
  type UndoToastStatus,
  type UndoToastStore,
  undoToast,
} from './components/toast/undo.svelte.ts';
export { default as Tooltip } from './components/tooltip/Tooltip.svelte';
export { default as TypingIndicator } from './components/typing-indicator/TypingIndicator.svelte';
export type { PickerUser } from './components/user-picker/types.ts';
export { default as UserPicker } from './components/user-picker/UserPicker.svelte';
export type {
  WindowChromeState,
  WindowChromeVariant,
} from './components/window-chrome/types.ts';
// Shells
export { default as WindowChrome } from './components/window-chrome/WindowChrome.svelte';
export { default as Wizard } from './components/wizard/Wizard.svelte';
export { default as LayoutHost } from './layouts/LayoutHost.svelte';
// Navigation as data for every layout; NavIcon and the layouts stay lazy (never in this barrel).
export {
  isNavPathActive,
  type NavAction,
  type NavBadge,
  type NavIconName,
  type NavIconRef,
  type NavModel,
  type NavModelItem,
  type NavSection,
  type NavUser,
  navBadge,
  navFromSidebar,
  navPath,
  type ResolvedNavItem,
  type ResolvedNavSection,
  resolveNav,
} from './layouts/nav-model.ts';
export { cn } from './lib/cn.ts';
export { type DateInput, formatDay, formatTime } from './lib/date.ts';
export { hashString, initials } from './lib/hash.ts';
export {
  getOverlayPortalTarget,
  setOverlayPortalTarget,
  subscribeOverlayPortalTarget,
} from './lib/overlay-portal.ts';
export type { IconComponent, NavItem, TriggerSnippet, WithElementRef } from './lib/types.ts';
