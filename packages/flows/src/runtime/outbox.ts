/**
 * Outbox helpers. Deliveries never leave the browser; URLs are masked before
 * they are shown so secrets in paths and query strings stay hidden.
 */

/** Keep the host, hide deep path segments and every query value. */
export function maskUrl(url = ''): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname
      .split('/')
      .map((segment, index) => (index > 1 && segment ? '••••' : segment))
      .join('/');
    return `${parsed.protocol}//${parsed.host}${path}${parsed.search ? '?••••' : ''}`;
  } catch {
    return '••••';
  }
}

export type DeliveryFamily = 'channel' | 'dm' | 'email' | 'other';

export function deliveryFamily(kind: string): DeliveryFamily {
  if (kind === 'channel' || kind === 'thread' || kind === 'notification') return 'channel';
  if (kind === 'dm' || kind === 'reply') return 'dm';
  if (kind === 'email' || kind === 'inbox') return 'email';
  return 'other';
}
