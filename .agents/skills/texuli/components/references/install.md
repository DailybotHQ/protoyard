# Install: packages or copied source

Back to [`../SKILL.md`](../SKILL.md).

## A. Use the packages

The packages are on npm in the 0.11 line, every one at `0.11.1`, a pre-1.0 line
(`latest` and `next` point to the newest; 1.0.0 will be the first stable release). An app outside a
Texuli checkout installs them plainly, for example
`pnpm add texuli @texuli/tokens`, and pins the exact version or `^0.11.0`
(for 0.x it accepts only 0.11.x, since a new minor may break) (the developer
runs the install; it uses the network). `@texuli/drag`,
`@texuli/workflows`, `@texuli/deck`, `@texuli/editor` (first published
in `0.5.0`), `@texuli/document` and `@texuli/pages` (both first published
in `0.7.0`), `@texuli/forms`, `@texuli/canvas` and `@texuli/sheets` (all
three first published in `0.8.0`) and `@texuli/mcp` (first published in
`0.9.0`) are in development and on npm as `0.11.1`.
Inside this monorepo, an app depends on the workspace packages:

```json
{
  "dependencies": {
    "@texuli/tokens": "workspace:*",
    "texuli": "workspace:*"
  }
}
```

An app in another folder can link a local checkout (paths relative to the
app):

```json
{
  "dependencies": {
    "@texuli/tokens": "link:../texuli/packages/tokens",
    "texuli": "link:../texuli/packages/texuli"
  }
}
```

Then the developer (in this monorepo, the lockfile owner) runs their package
manager's install. The packages ship Svelte and TypeScript sources, so the
app's bundler compiles them: Vite with `@sveltejs/vite-plugin-svelte`,
SvelteKit, or Astro with `@astrojs/svelte` (Astro needs
`vite.ssr.noExternal: ['texuli', /^@texuli\//]`). An Astro 7 site in a Texuli
workspace can also use `@texuli/astro`: its `texuli()` integration applies the
cached theme and mode before paint (CSP-friendly bootstrap, nonce option), and
`@texuli/astro/styles.css` carries the token contract (see
`packages/astro/README.md`). For a whole site, `defineSite` from
`@texuli/astro/site` validates the pages, navigation and canonical metadata
once; `sitePageMeta` gives each page its title, description and canonical
URL, and `siteSitemap` writes the sitemap from the same model
(`packages/astro/docs/site.md`). `@texuli/astro/content` parses a closed set
of content blocks (`parseTexuliBlocks`), so page content never reaches an
HTML sink.

**Always load `@texuli/tokens/base.css`** (once, before any component). Since
`0.9.0` component CSS reads the system tokens (the space unit, control and
icon sizes, shape radii and type roles of `@texuli/tokens/system`) with no
fallback, and a theme does not declare them: an app with its own reset that skips `base.css`
renders controls with no size. From `0.10.0`, such an app can
load `@texuli/tokens/system.css` instead: the system token defaults alone,
with no reset.

Import each component through its subpath:

```svelte
<script lang="ts">
  import { Button } from 'texuli/button';
  import { Card, CardContent, CardHeader, CardTitle } from 'texuli/card';
</script>

<Card>
  <CardHeader>
    <CardTitle>Invoices</CardTitle>
  </CardHeader>
  <CardContent>
    <Button variant="secondary" onclick={() => console.log('export')}>Export</Button>
  </CardContent>
</Card>
```

## Wire tokens and CSS once: `texuli init`

`texuli init` detects Vite, Astro or SvelteKit from `package.json` and writes:
- the stylesheet (`@texuli/tokens/base.css` plus the theme's light and dark
  tokens);
- its import in the app's entry;
- the no-flash script and `data-tx-theme` on `<html>`;
- `texuli.config.json`.

Running it again changes nothing. It never writes outside the app or through
a symlink. See `packages/tools/docs/cli-init.md`.

## B. Copy a component: `texuli add`

`texuli add <id>` copies a styled component's source (its `.svelte`, `.ts` and
`.css` files) into `src/components/texuli/<id>` in the app, or `--out <dir>`.
Every copied file starts with a provenance block: an HTML comment in
`.svelte` files, a block comment in `.ts`, `.js` and `.css` files:

```ts
/**
 * @texuli/add — copied styled source. Do not remove this block.
 * id: button
 * package: texuli
 * version: 0.1.0
 * source: packages/texuli/src/components/button/index.ts
 */
```

The app then imports its own copy instead of the package:

```ts
import { Button } from './components/texuli/button/index.ts';
```

What `texuli add` refuses:
- unknown ids (`--list` shows the addable ones);
- anything under `@texuli/primitives` (copies keep importing primitives);
- existing files, unless `--force`;
- destinations outside the app, or behind a symlink.

A copied component still imports `texuli/cx` (and, for some, `texuli/button`
or `texuli/icons`): those stay package dependencies. See
`packages/tools/docs/cli-add.md`.
