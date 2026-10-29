# Media URL policy (short)

| Trust | Images (`safeImageSrc`, `safeImageSrcset`) | Audio and video (`safeMediaSrc`) |
| --- | --- | --- |
| `untrusted` (default for agent/user content) | `https:` and relative assets only | Blob URLs, or exact origins from an HTTPS `allowedOrigins` list |
| `developer` | Also `http:`, valid blob URLs, and PNG, JPEG, GIF, WebP or AVIF base64 `data:` images up to 1 MiB decoded | Also `http:`, HTTPS from any origin and relative asset paths; `data:` is never accepted for media |

Never allowed on either tier: `javascript:`, `vbscript:`, SVG or non-image
`data:` URLs, and protocol-relative values (`//host`, `\\host`). Links use
`safeHref`: untrusted allows only `https:`, `mailto:` and `#fragment`.

Always:

1. Pass `src` / `poster` / track URLs through `safeImageSrc` or `safeMediaSrc`.
2. Prefer `allowedOrigins` on video/gallery when the host uses remote HTTPS.
3. For monorepo examples, use `import asset from './x.svg?url&no-inline'` so Vite
   does not inline small files as `data:` URLs that untrusted policy rejects.
4. Generator slot results are re-checked by the slot before paint; unsafe →
   `blocked`, never a live sink.

See `@texuli/core` docs and `packages/core/tests/url-policy.test.ts` for hostile
inputs (mixed case, whitespace, bidi smuggling).
