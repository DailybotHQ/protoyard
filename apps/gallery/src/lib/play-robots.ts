/** Share fragments stay client-side, so only the browser can mark them noindex. */
export function syncShareRobots(hash: string, head: HTMLElement): void {
  const hasBlueprintFragment = hash.includes('bp=');
  let robots = head.querySelector<HTMLMetaElement>('meta[name="robots"]');
  if (hasBlueprintFragment) {
    if (!robots) {
      robots = document.createElement('meta');
      robots.name = 'robots';
      head.append(robots);
    }
    robots.content = 'noindex';
  } else if (robots?.content === 'noindex') {
    robots.remove();
  }
}
