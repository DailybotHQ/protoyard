/**
 * Kit navigation components render real `<a href>` links. Inside a demo we keep those clicks
 * local (update demo state) instead of changing the showcase's own hash route.
 */
export function interceptDemoNav(event: MouseEvent, onNavigate: (href: string) => void): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const anchor = target.closest('a[href]');
  const href = anchor?.getAttribute('href');
  if (!href?.startsWith('#demo')) return;
  event.preventDefault();
  onNavigate(href);
}

/** Resolves after `ms`; used to simulate network latency in demos. */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Trigger props from overlays (e.g. Tooltip) carry their own `onclick`. A plain `onclick` after
 * `{...props}` would replace it, so compose both handlers instead.
 */
export function withClick(
  props: Record<string, unknown>,
  handler: (event: MouseEvent) => void
): Record<string, unknown> {
  const original = props.onclick;
  return {
    ...props,
    onclick: (event: MouseEvent) => {
      if (typeof original === 'function') original(event);
      handler(event);
    },
  };
}
