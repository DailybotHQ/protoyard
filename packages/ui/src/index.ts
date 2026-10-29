/// <reference path="./css.d.ts" />
import type { ComponentProps } from 'svelte';
import type { Button as TexuliButton } from 'texuli/button';

// Utilities and shared types

// Display
export { Badge, type BadgeVariant, badgeClass as badgeVariants } from 'texuli/badge';
// Primitives
export { Button, type ButtonSize, type ButtonVariant, buttonVariants } from 'texuli/button';
// Layout & navigation
export { AppShell } from 'texuli/layouts/shells';
export { Breadcrumb, type BreadcrumbItem } from 'texuli/navigation';
export { Accordion, type AccordionItemDef as AccordionItem } from 'texuli/tabs-accordion';
export {
  type ActorIdentity,
  type ActorKind,
  default as ActorRow,
} from './components/actors/ActorRow.svelte';
export {
  ADAPTIVE_OVERLAY_BREAKPOINT,
  AdaptiveOverlay,
  type AdaptiveOverlayMode,
  type AdaptiveOverlayPresentation,
  type AdaptiveOverlayWideKind,
  type ResolveAdaptiveOverlayInput,
  resolveAdaptiveOverlayPresentation,
} from './components/adaptive-overlay/index.ts';
export { default as AlertDialog } from './components/alert-dialog/AlertDialog.svelte';
export {
  type AppShellContext,
  getAppShellContext,
} from './components/app-shell/context.ts';
export { default as Avatar } from './components/avatar/Avatar.svelte';
// Mobile
export { default as BottomNav } from './components/bottom-nav/BottomNav.svelte';
export { default as BottomSheet } from './components/bottom-sheet/BottomSheet.svelte';
export { formatAddress, parseAddress } from './components/browser-chrome/address.ts';
export { default as BrowserChrome } from './components/browser-chrome/BrowserChrome.svelte';
/** The props of `Button` (generic styled components come from `texuli`). */
export type ButtonProps = ComponentProps<typeof TexuliButton>;
// Collaboration
export { ChatThread, groupMessages, MessageList, TypingIndicator } from '@texuli/chat';
export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardGrid,
  CardHeader,
  CardTitle,
} from 'texuli/card';
export { Carousel, type CarouselItem } from 'texuli/carousel';
export {
  Checkbox,
  Radio as RadioGroupItem,
  RadioGroup,
  type RadioOption,
  Switch,
} from 'texuli/choice';
export { ErrorState } from 'texuli/empty';
export { Progress, Skeleton } from 'texuli/feedback';
export { Field as FormField, Label } from 'texuli/field';
export { Textarea } from 'texuli/input';
export { Kbd } from 'texuli/kbd-code';
export { default as SplitView } from 'texuli/layouts/app/split-view';
export { Separator } from 'texuli/separator-aspect';
// Flows
export { Stepper, type StepperStep, Wizard } from 'texuli/stepper';
// Feedback
export { Toaster } from 'texuli/toast';
export { Tooltip } from 'texuli/tooltip';
export { default as ChipGroup } from './components/ChipGroup.svelte';
export type {
  ChatAuthor,
  ChatMessage,
  ChatMessageStatus,
  MessageGroup,
} from './components/chat/types.ts';
export type { ChipOption } from './components/chip-group-types.ts';
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
// Scheduling inputs: timezone, weekdays, time, date and date range
export * from './components/form/scheduling/index.ts';
// Form utilities: tags/email, emoji, password strength, character counter
export * from './components/form/utilities/index.ts';
export type { FormFieldControl } from './components/form-field/form-field.ts';
export { default as Header } from './components/header/Header.svelte';
export { ProposalTag, SimulatedTag } from './components/honesty/index.ts';
export { default as ImageInput } from './components/image-input/ImageInput.svelte';
export {
  buildImagePreviews,
  DEFAULT_IMAGE_ACCEPT,
  type ImagePreview,
  isPreviewableImage,
  RASTER_IMAGE_TYPES,
  revokeImagePreviews,
} from './components/image-input/preview.ts';
export { default as Input } from './components/input/Input.svelte';
export { default as Kanban } from './components/kanban/Kanban.svelte';
export type { KanbanColumn } from './components/kanban/types.ts';
export { default as LoadingState } from './components/loading-state/LoadingState.svelte';
export { default as MobileAppShell } from './components/mobile-app-shell/MobileAppShell.svelte';
export { default as MobileHeader } from './components/mobile-header/MobileHeader.svelte';
export { default as NumberStepper } from './components/NumberStepper.svelte';
export { default as Notice } from './components/notice/Notice.svelte';
export {
  NOTICE_DEFAULT_ICONS,
  NOTICE_TONE_CLASSES,
  NOTICE_TONES,
  type NoticeTone,
} from './components/notice/tones.ts';
export { default as OtpInput } from './components/otp-input/OtpInput.svelte';
export { default as Drawer } from './components/overlay/Drawer.svelte';
export {
  DEFAULT_DRAWER_SIZE,
  DRAWER_PLACEMENTS,
  type DrawerPlacement,
  resolveDrawerSize,
} from './components/overlay/drawer.ts';
export {
  installUndoToasterFocusExemption,
  isUndoToasterTarget,
  UNDO_TOASTER_ATTR,
} from './components/overlay/focus-exempt.ts';
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
export { default as ScenarioSwitcher } from './components/ScenarioSwitcher.svelte';
export { default as StarRating } from './components/StarRating.svelte';
export { default as SafeArea } from './components/safe-area/SafeArea.svelte';
export { default as Select } from './components/select/Select.svelte';
export type { SelectOption } from './components/select/types.ts';
export { default as Sidebar } from './components/sidebar/Sidebar.svelte';
export type { SidebarItem, SidebarSection } from './components/sidebar/types.ts';
export { default as Spinner } from './components/spinner/Spinner.svelte';
export { default as StatCard } from './components/stat-card/StatCard.svelte';
export {
  formatDelta,
  resolveTrend,
  type Trend,
  trendTone,
  trendWord,
} from './components/stat-card/trend.ts';
export { default as StatusChip } from './components/status-chip/StatusChip.svelte';
export {
  STATUS_CHIP_TONE_CLASSES,
  STATUS_CHIP_TONES,
  type StatusChipTone,
} from './components/status-chip/tones.ts';
// Disclosure
export { default as Tabs } from './components/tabs/Tabs.svelte';
export type { TabItem } from './components/tabs/types.ts';
export {
  DEFAULT_TOAST_DURATION,
  MAX_TOASTS,
  resetToastStore,
  type ToastAction,
  type ToastAnnouncement,
  type ToastItem,
  type ToastKind,
  type ToastOptions,
  type ToastSettleReason,
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
export type { PickerUser } from './components/user-picker/types.ts';
export { default as UserPicker } from './components/user-picker/UserPicker.svelte';
export type {
  WindowChromeState,
  WindowChromeVariant,
} from './components/window-chrome/types.ts';
// Shells
export { default as WindowChrome } from './components/window-chrome/WindowChrome.svelte';
export { default as LayoutHost } from './layouts/LayoutHost.svelte';
// Navigation is data; navigation layout modules stay lazy. Content primitives are separate exports.
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
export { default as PageGrid } from './layouts/PageGrid.svelte';
export { cn } from './lib/cn.ts';
export { type DateInput, formatDay, formatTime } from './lib/date.ts';
export { hashString, initials } from './lib/hash.ts';
export {
  getOverlayPortalTarget,
  setOverlayPortalTarget,
  subscribeOverlayPortalTarget,
} from './lib/overlay-portal.ts';
export {
  escapeSelectorValue,
  findOption,
  type RovingEntry,
  rovingKeydown,
  rovingTabIndex,
} from './lib/roving.ts';
export type { IconComponent, NavItem, TriggerSnippet, WithElementRef } from './lib/types.ts';
