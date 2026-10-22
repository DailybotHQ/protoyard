/**
 * Copies text to the clipboard: the async Clipboard API first (secure context
 * and permission), then a hidden-textarea `execCommand('copy')` fallback for
 * file:// artifacts and older browsers. Resolves false when neither works, so
 * the caller can say so instead of claiming success.
 */
export async function copyText(text: string, doc: Document = document): Promise<boolean> {
  try {
    const clipboard = doc.defaultView?.navigator.clipboard;
    if (clipboard?.writeText) {
      await clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path.
  }
  try {
    const area = doc.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.setAttribute('aria-hidden', 'true');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    area.style.pointerEvents = 'none';
    const active = doc.activeElement as HTMLElement | null;
    doc.body.append(area);
    area.select();
    const ok = doc.execCommand?.('copy') === true;
    area.remove();
    active?.focus?.({ preventScroll: true });
    return ok;
  } catch {
    return false;
  }
}
