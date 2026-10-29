/**
 * The toast API is Texuli's (`texuli/toast`): render one `<Toaster />` near
 * the app root and call `toast.success(…)`, `toast.error(…)`, `toast.info(…)`,
 * `toast.warning(…)`, `toast.promise(…)` or `toast.dismiss(id?)`. Texuli's
 * Toaster announces each toast (`ToastItem.announcement`) and pauses its
 * countdown on hover and focus; hosts hold it with `toast.pause(key)` and
 * `toast.resume(key)`. `onSettle` reports why a toast left (`timeout`,
 * `dismiss` or `action`).
 */
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
} from 'texuli/toast';
