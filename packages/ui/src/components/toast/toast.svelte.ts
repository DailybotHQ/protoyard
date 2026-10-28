/**
 * The toast API is Texuli's (`texuli/toast`): render one `<Toaster />` near
 * the app root and call `toast.success(…)`, `toast.error(…)`, `toast.info(…)`,
 * `toast.warning(…)`, `toast.promise(…)` or `toast.dismiss(id?)`. Texuli's
 * Toaster announces each toast and pauses its countdown on hover and focus.
 */
export {
  MAX_TOASTS,
  type ToastAction,
  type ToastItem,
  type ToastKind,
  type ToastOptions,
  type ToastStore,
  toast,
} from 'texuli/toast';

/**
 * @deprecated Texuli's Toaster announces toasts through its own live region;
 * nothing reads or writes an announcement any more.
 */
export interface ToastAnnouncement {
  id: string;
  text: string;
  assertive: boolean;
}
