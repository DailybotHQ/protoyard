# Protoyard Player

The player is the no-install way to explore a blueprint. It derives a working
prototype in the browser and uses IndexedDB for simulated data; it does not
connect to a product backend. Generated prototypes remain the second level:
they are ordinary Vite apps that can be edited, validated and exported.

## Entry points

- Run the workspace player with `pnpm --filter @protoyard/player dev`.
- Build a hosted showcase with
  `pnpm protoyard showcase --site https://protoyard.app`; the build contains
  `/play/` and the standalone player assets at `/player/`.
- Open an eligible prototype or blueprint from its gallery detail page with
  **Open in player**. The gallery builds a `/play/#bp=…` link from validated
  blueprint data; entries without a blueprint file or links over the share
  limit do not show the action. The configured site base is preserved.
- `/play/` accepts a pasted blueprint JSON document up to 256 KB and opens
  share links. Its frame uses the player's exact-origin `protoyard-player/1`
  bridge. Share fragments stay in the browser URL and are not sent to the
  server.
- The hosted gallery publishes this guide and the other user-facing guides at
  `/docs/`; contributor and internal guides are not included. A search box on
  the docs pages finds sections by guide title, heading and text, and opens
  the matching heading.
  - The index is a static file (`/docs/search-index.json`), generated at build
    time and fetched only when a reader focuses or types in the box.
  - Nothing is sent to a remote service.
  - Arrow keys choose a result, Enter opens it, Escape closes the list and
    then clears the query, and a live region announces the result count.
- With a configured site (`--site` or `GALLERY_SITE`), `sitemap.xml` lists
  `/play/`, `/docs/` and every published guide as absolute, base-aware URLs,
  and `robots.txt` points at it. Share instances (`/play/#bp=…`, `?src=…`) are
  never listed: each one is a viewer's blueprint, not a page of the site.

The player also supports a `?src=./blueprint.json` URL for a JSON file next to
the player. The picker accepts a local file or the bundled fictional demo.
Every source passes the bounded, untrusted blueprint loader before it is used.
See [SECURITY](SECURITY.md) for the trust boundaries and
[the player package README](../packages/player/README.md) for the runtime and
embed protocol.

## Share links and browser support

Share links use `CompressionStream('deflate-raw')` to create and
`DecompressionStream('deflate-raw')` to open a link. Both are available in
Chrome 103+, Safari 16.4+ and Firefox 113+. The hosted playground disables
share-link creation with a clear message when compression is unavailable; the
player explains when decompression is unavailable and still offers file
loading. Use the blueprint file when a link is too large. The encoded bytes
may differ across browser engines, so never compare share URLs byte for byte;
compare the decoded blueprint data.

Share links contain the blueprint itself. The player refuses links longer
than 16 KB and decoded input larger than 256 KB. Pasted text is capped at 256
KB before JSON parsing. The `/play/` landing page is indexable, but a visit
with a share fragment is marked `noindex`.

The hosted player sends a Content Security Policy from the showcase root
`_headers` file under `/player/*`; this includes `frame-ancestors` because a
meta policy cannot set it. Its `style-src` keeps `'unsafe-inline'` for the
runtime style attributes and elements Svelte and the theme engine create.
Cloudflare Pages reads `_headers` only at the output root, so showcase builds
merge the player rules there rather than relying on the nested player file.

A local `pnpm --filter @protoyard/player build` writes the app to
`packages/player/dist/app/`, next to the published embed client in
`dist/embed/`. The folder holds `_headers` and `protoyard-player-assets.json`,
the sha256 list of every other file that `protoyard quick` verifies before it
copies the player.

## Validate and promote

```bash
pnpm vitest run packages/player/tests/sources.test.ts
pnpm --filter @protoyard/player typecheck
pnpm protoyard showcase --site https://protoyard.app
```

When the exploration is ready to become a full project, generate a prototype
from its blueprint and validate the generated application:

```bash
pnpm protoyard generate my-prototype --blueprint path/to/blueprint.json
pnpm protoyard validate my-prototype --build
```
