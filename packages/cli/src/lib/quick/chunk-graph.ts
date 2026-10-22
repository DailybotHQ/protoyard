/**
 * The chunk graph of a built player page, read from the emitted files (no
 * Vite manifest needed): which JS chunks and stylesheets one HTML entry can
 * ever load. Used by the single-file export to embed only those.
 *
 * A chunk refers to another file in three emitted forms, all quoted relative
 * paths: static imports (`from"./x.js"`), dynamic imports (`import("./x.js")`,
 * also in template literals) and Vite's preload dependency lists
 * (`__vite__mapDeps` arrays of `"./x.js"` and `"./x.css"`). Every quoted
 * `./name.js` or `./name.css` (or `assets/name.…`) naming a file that exists
 * counts, so the walk errs on the side of including a file.
 */

/** Quoted relative references to emitted `.js` and `.css` files in chunk code or HTML. */
export function chunkReferences(code: string): { js: string[]; css: string[] } {
  const js = new Set<string>();
  const css = new Set<string>();
  for (const match of code.matchAll(
    /(["'`])(?:\.\/|\.\/assets\/|assets\/)([\w.-]+\.(js|css))\1/g
  )) {
    const file = match[2] as string;
    (match[3] === 'js' ? js : css).add(file);
  }
  return { js: [...js], css: [...css] };
}

export interface EntryGraph {
  /** The entry module chunk (the page's `<script type="module" src>`). */
  entry: string;
  /** Every reachable JS chunk, the entry first, then in discovery order. */
  js: string[];
  /** Stylesheets the page links (in order), then those reachable chunks preload (sorted). */
  css: string[];
}

export interface EntryGraphInput {
  /** The page's HTML (index.html, deck.html, …). */
  html: string;
  /** Files in `assets/`. */
  files: readonly string[];
  /** Reads an `assets/` file as text. */
  read: (file: string) => Promise<string>;
  /** Chunks never embedded or followed (the world-generation worker). */
  exclude?: (file: string) => boolean;
}

/** Walks a page's chunk graph from its module entry through static and dynamic references. */
export async function entryGraph(input: EntryGraphInput): Promise<EntryGraph | null> {
  const known = new Set(input.files);
  const excluded = input.exclude ?? (() => false);
  const entry = /<script\b[^>]*\btype="module"[^>]*\bsrc="\.\/assets\/([\w.-]+\.js)"/i.exec(
    input.html
  )?.[1];
  if (!entry) return null;

  const linked = [...input.html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*>/gi)]
    .map(([tag]) => /\bhref="\.\/assets\/([\w.-]+\.css)"/i.exec(tag)?.[1])
    .filter((file): file is string => file !== undefined && known.has(file));

  const js: string[] = [];
  const preloaded = new Set<string>();
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.shift() as string;
    if (seen.has(file) || !known.has(file) || excluded(file)) continue;
    seen.add(file);
    js.push(file);
    const refs = chunkReferences(await input.read(file));
    for (const next of refs.js) if (!seen.has(next)) queue.push(next);
    for (const sheet of refs.css) if (known.has(sheet)) preloaded.add(sheet);
  }
  const css = [...linked, ...[...preloaded].filter((file) => !linked.includes(file)).sort()];
  return { entry, js, css };
}
