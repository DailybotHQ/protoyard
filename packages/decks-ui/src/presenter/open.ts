/**
 * Open a presenter popup or signal that the host should use the in-page
 * fallback. Pure decision helpers plus a thin window.open wrapper.
 */
import {
  createBroadcastPresenterTransport,
  createPresenterLink,
  type PresenterLink,
  type PresenterPosition,
  type PresenterTransport,
  sanitizeNamespace,
} from '@protoyard/decks';

export type PresenterOpenResult =
  | { mode: 'popup'; window: Window; transport: PresenterTransport; link: PresenterLink }
  | { mode: 'fallback'; reason: 'popup-blocked' | 'no-broadcast' | 'no-window' };

export type OpenPresenterOptions = {
  /** Stable deck id / prototype slug for the channel name. */
  namespace: string;
  /** Current position published on hello. */
  position: PresenterPosition;
  /** Called when the presenter window (or a peer) sends a new position. */
  onRemote: (position: PresenterPosition) => void;
  /**
   * Optional window.open override for tests. Return null to simulate a block.
   */
  openWindow?: (url: string, target: string, features: string) => Window | null;
  /**
   * Optional BroadcastChannel factory override. Pass `null` to force the
   * no-broadcast fallback (tests). Omit to use the host global when present.
   */
  broadcast?: (new (name: string) => BroadcastChannel) | null;
  /** About:blank URL or a presenter document URL. */
  url?: string;
};

/**
 * Try BroadcastChannel + window.open. When either is missing or blocked,
 * return `{ mode: 'fallback' }` so the host toggles the in-page split view.
 */
export function openPresenter(options: OpenPresenterOptions): PresenterOpenResult {
  if (typeof window === 'undefined') {
    return { mode: 'fallback', reason: 'no-window' };
  }
  const transport =
    options.broadcast === null
      ? null
      : createBroadcastPresenterTransport(sanitizeNamespace(options.namespace), options.broadcast);
  if (!transport) {
    return { mode: 'fallback', reason: 'no-broadcast' };
  }

  const open =
    options.openWindow ??
    ((url: string, target: string, features: string) => window.open(url, target, features));
  const features = 'popup=yes,width=1100,height=720,menubar=no,toolbar=no,location=no';
  const target = `protoyard-presenter-${sanitizeNamespace(options.namespace)}`;
  let popup: Window | null = null;
  try {
    popup = open(options.url ?? 'about:blank', target, features);
  } catch {
    popup = null;
  }
  if (!popup) {
    transport.close();
    return { mode: 'fallback', reason: 'popup-blocked' };
  }

  const link = createPresenterLink({
    transport,
    initial: options.position,
    onRemote: options.onRemote,
  });
  link.publish(options.position, 'hello');

  return { mode: 'popup', window: popup, transport, link };
}
