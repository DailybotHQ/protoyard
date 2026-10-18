const schemePattern = /^[a-z][a-z\d+.-]*:/i;

function stripAuthority(value: string): string {
  const slash = value.indexOf('/');
  const query = value.indexOf('?');
  const fragment = value.indexOf('#');
  const boundaries = [slash, query, fragment].filter((index) => index >= 0);
  return boundaries.length === 0 ? '' : value.slice(Math.min(...boundaries));
}

/** Converts address-bar text to a same-document hash route. */
export function parseAddress(value: string): string {
  let path = Array.from(value.trim())
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join('')
    .replaceAll('\\', '/');

  if (path.startsWith('#')) {
    path = path.slice(1);
  } else if (/^[^/?#]+:\d+(?:[/?#]|$)/.test(path)) {
    path = stripAuthority(path);
  } else if (schemePattern.test(path)) {
    path = path.replace(schemePattern, '');
    if (path.startsWith('//')) path = stripAuthority(path.slice(2));
  } else if (path.startsWith('//')) {
    path = stripAuthority(path.slice(2));
  } else {
    const firstSegment = path.split(/[/?#]/, 1)[0] ?? '';
    if (firstSegment.includes('.') || firstSegment.includes(':') || firstSegment === 'localhost') {
      path = stripAuthority(path);
    }
  }

  const hashRoute = path.indexOf('/#/');
  if (hashRoute >= 0) path = path.slice(hashRoute + 3);
  path = path.replace(/^\/+/, '');
  return `#/${path}`;
}

/** Displays a route under the prototype's fictional origin. */
export function formatAddress(origin: string, route: string): string {
  return `${origin.trim().replace(/\/+$/, '')}/${parseAddress(route)}`;
}
