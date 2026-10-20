/**
 * Output in the repository's Biome style, so `biome check --write` never
 * rewrites generated files (a rewrite would break their hash header and the
 * drift check). Covered by a test that runs Biome on emitted output.
 */

const LINE_WIDTH = 100;

/**
 * A TypeScript string literal the way Biome writes it: single quotes, unless
 * the value contains a single quote and no double quote. Escaping comes from
 * JSON.stringify, so control characters and backslashes are always safe.
 */
export function tsString(value: string): string {
  const json = JSON.stringify(value);
  if (value.includes("'") && !value.includes('"')) return json;
  const body = json.slice(1, -1).replace(/\\"/g, '"').replace(/'/g, "\\'");
  return `'${body}'`;
}

const isPrimitive = (value: unknown) =>
  value === null || ['string', 'number', 'boolean'].includes(typeof value);

/**
 * JSON like `JSON.stringify(value, null, 2)` plus Biome's array rule: an
 * array of primitives goes on one line when it fits the line width. Objects
 * stay expanded (Biome keeps an object expanded when its source is).
 */
export function formatJson(value: unknown): string {
  const render = (node: unknown, indent: string, prefixWidth: number): string => {
    if (Array.isArray(node)) {
      if (node.length === 0) return '[]';
      if (node.every(isPrimitive)) {
        const inline = `[${node.map((v) => JSON.stringify(v)).join(', ')}]`;
        if (prefixWidth + inline.length + 1 <= LINE_WIDTH) return inline;
      }
      const inner = `${indent}  `;
      return `[\n${node.map((v) => `${inner}${render(v, inner, inner.length)}`).join(',\n')}\n${indent}]`;
    }
    if (node !== null && typeof node === 'object') {
      const entries = Object.entries(node).filter(([, v]) => v !== undefined);
      if (entries.length === 0) return '{}';
      const inner = `${indent}  `;
      const lines = entries.map(([k, v]) => {
        const key = `${JSON.stringify(k)}: `;
        return `${inner}${key}${render(v, inner, inner.length + key.length)}`;
      });
      return `{\n${lines.join(',\n')}\n${indent}}`;
    }
    return JSON.stringify(node);
  };
  return `${render(value, '', 0)}\n`;
}

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/**
 * A TypeScript object or array literal the way Biome formats it: bare keys
 * when they are identifiers, `tsString` strings, trailing commas on expanded
 * lines, and primitive arrays inline when they fit (the same rule as `formatJson`).
 */
export function formatTs(value: unknown): string {
  const scalar = (node: unknown) =>
    typeof node === 'string' ? tsString(node) : JSON.stringify(node);
  const render = (node: unknown, indent: string, prefixWidth: number): string => {
    if (Array.isArray(node)) {
      if (node.length === 0) return '[]';
      if (node.every(isPrimitive)) {
        const inline = `[${node.map(scalar).join(', ')}]`;
        if (prefixWidth + inline.length + 1 <= LINE_WIDTH) return inline;
      }
      const inner = `${indent}  `;
      return `[\n${node.map((v) => `${inner}${render(v, inner, inner.length)},`).join('\n')}\n${indent}]`;
    }
    if (node !== null && typeof node === 'object') {
      const entries = Object.entries(node).filter(([, v]) => v !== undefined);
      if (entries.length === 0) return '{}';
      const inner = `${indent}  `;
      const lines = entries.map(([k, v]) => {
        const key = `${IDENTIFIER.test(k) ? k : tsString(k)}: `;
        // Like Biome, a scalar that would overflow the line moves under its key.
        if (isPrimitive(v) && inner.length + key.length + scalar(v).length + 1 > LINE_WIDTH) {
          return `${inner}${key.trimEnd()}\n${inner}  ${scalar(v)},`;
        }
        return `${inner}${key}${render(v, inner, inner.length + key.length)},`;
      });
      return `{\n${lines.join('\n')}\n${indent}}`;
    }
    return scalar(node);
  };
  return render(value, '', 0);
}
