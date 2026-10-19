import {
  defaultDeviceFor,
  deviceFitsShell,
  getDevice,
  orient,
  type PrototypeRuntime,
  type ResolvedShell,
  resolveShell,
  type Shell,
  ShellSchema,
} from '@protoyard/core';
import { activeFrame } from './frames/registry.ts';

/**
 * Full screen (frameless) mode for framed shells.
 *
 * Full screen is the same state as DevTools → Appearance → "Device frame" off:
 * a temporary `shell: 'none'` override. The runtime persists overrides per
 * prototype (its control database) and `?shell=none` or `?frame=none` sets it
 * from a link. This module only remembers which shell override to put back
 * when the frame returns, in `localStorage` per prototype namespace.
 */

/** Stored when the frame came from the scenario or manifest: going back clears the override. */
const NO_OVERRIDE = 'default';

export function frameReturnKey(namespace: string): string {
  return `protoyard.${namespace}.frame-return`;
}

/**
 * Remembers the shell override active before full screen (`undefined` when
 * none was set). Private mode or a full quota: nothing is remembered and
 * leaving full screen clears the override.
 */
export function saveFrameReturn(
  namespace: string,
  shell: Shell | undefined,
  storage: Storage | undefined = globalThis.localStorage
): void {
  try {
    storage?.setItem(frameReturnKey(namespace), shell ?? NO_OVERRIDE);
  } catch {
    // Nothing persists; the default frame comes back.
  }
}

/**
 * The shell override to restore: a framed shell, or `undefined` to clear the
 * override (nothing stored, `none`, or an unknown value).
 */
export function loadFrameReturn(
  namespace: string,
  storage: Storage | undefined = globalThis.localStorage
): Shell | undefined {
  try {
    const raw = storage?.getItem(frameReturnKey(namespace));
    const parsed = ShellSchema.safeParse(raw);
    return parsed.success && parsed.data !== 'none' ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export function clearFrameReturn(
  namespace: string,
  storage: Storage | undefined = globalThis.localStorage
): void {
  try {
    storage?.removeItem(frameReturnKey(namespace));
  } catch {
    // Nothing to clear.
  }
}

/**
 * `href` without the link parameters that open a prototype frameless
 * (`frame=none`, `shell=none`), so a reload after leaving full screen keeps
 * the frame. Other parameters and the hash route are kept.
 */
export function withoutFramelessParams(href: string): string {
  const url = new URL(href, 'http://protoyard.local');
  if (url.searchParams.get('frame') === 'none') url.searchParams.delete('frame');
  if (url.searchParams.get('shell') === 'none') url.searchParams.delete('shell');
  if (/^https?:\/\//.test(href)) return url.toString();
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Open surfaces that own Escape (dialogs, menus, listboxes): the app closes those first. */
const ESCAPE_OWNERS = [
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[role="menu"]',
  '[role="listbox"]',
  '[aria-modal="true"]',
  'dialog[open]',
].join(',');

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('input, textarea, select')) return true;
  const editable = target.closest('[contenteditable]');
  return editable !== null && editable.getAttribute('contenteditable') !== 'false';
}

/**
 * Whether an Escape keydown should leave full screen: plain Escape, not
 * handled by the app, not typed in a field, and with no dialog, menu or
 * listbox open (Escape closes those first).
 */
export function isFrameExitKey(event: KeyboardEvent, doc: Document = document): boolean {
  if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return false;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
  if (isEditable(event.target)) return false;
  // Collapsed surfaces that stay mounted (inert, aria-hidden, hidden) do not count.
  return ![...doc.querySelectorAll(ESCAPE_OWNERS)].some(
    (el) => el.closest('[inert], [aria-hidden="true"], [hidden]') === null
  );
}

export interface FrameRestoreInput {
  windowWidth: number;
  embedded: boolean;
  cssReady: boolean;
}

/**
 * The framed shell "Show in frame" would bring back, or `undefined` when the
 * app is not in full screen mode (no `none` override) or when leaving it would
 * not show a frame anyway (the default shell is `none`, the window is too
 * narrow, the app is embedded). Only then do the restore control and Escape
 * apply.
 */
export function frameToRestore(
  runtime: PrototypeRuntime,
  input: FrameRestoreInput
): ResolvedShell | undefined {
  const { shell } = runtime.theme.appearance();
  if (shell.value !== 'none' || shell.source !== 'override') return undefined;
  const manifest = runtime.manifest;
  const requested =
    loadFrameReturn(manifest.storage.namespace) ??
    runtime.scenarios.active()?.scenario.appearance?.shell ??
    manifest.preview.shell ??
    'auto';
  const target = resolveShell(requested, manifest.platform);
  if (target === 'none') return undefined;
  const preview = manifest.preview;
  const deviceId =
    preview.device && deviceFitsShell(preview.device, target)
      ? preview.device
      : defaultDeviceFor(target, preview.viewport);
  const device = getDevice(deviceId);
  const spec = device ? orient(device, preview.orientation ?? device.orientation) : undefined;
  return activeFrame({ shell: target, spec, ...input }) === 'none' ? undefined : target;
}

/**
 * Full screen: remembers the current shell override, then sets `shell: none`
 * (the same override DevTools' "Device frame" switch writes). With `browser`,
 * also asks the real browser for full screen; a refusal is ignored.
 */
export async function enterFullScreen(
  runtime: PrototypeRuntime,
  options: { browser?: boolean } = {}
): Promise<void> {
  saveFrameReturn(runtime.manifest.storage.namespace, runtime.overrides.get().shell);
  if (options.browser) {
    document.documentElement.requestFullscreen?.().catch(() => {});
  }
  await runtime.theme.setOverride({ shell: 'none' });
}

/**
 * Back to the frame: restores the remembered shell override (or clears it),
 * leaves real browser full screen, and drops `frame=none` / `shell=none` from
 * the address so a reload keeps the frame.
 */
export async function exitFullScreen(runtime: PrototypeRuntime): Promise<void> {
  const namespace = runtime.manifest.storage.namespace;
  const back = loadFrameReturn(namespace);
  clearFrameReturn(namespace);
  if (typeof document !== 'undefined' && document.fullscreenElement) {
    document.exitFullscreen?.().catch(() => {});
  }
  if (typeof location !== 'undefined') {
    const next = withoutFramelessParams(location.href);
    if (next !== location.href) history.replaceState(history.state, '', next);
  }
  if (back) await runtime.theme.setOverride({ shell: back });
  else await runtime.overrides.clear(['shell']);
}
