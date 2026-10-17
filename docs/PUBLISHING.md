# Publishing

A prototype builds into a plain static site: HTML, JS and CSS, with no server,
credentials or network calls at runtime. This page covers building,
exporting, previewing and putting it on a host. Design decisions: ADR-009
(hash routing) and ADR-014 (publishing adapters) in
[DECISIONS.md](DECISIONS.md).

## The commands

| Command | Does | Contacts a provider |
| --- | --- | --- |
| `pnpm protoyard build <slug>` | Production build → `artifacts/<slug>/dist` + `build-manifest.json` | No |
| `pnpm protoyard export <slug>` | Build, isolation check, ZIP → `artifacts/<slug>/<slug>.zip` | No |
| `pnpm protoyard preview <slug>` | Serves `artifacts/<slug>/dist` like a static host | No |
| `pnpm protoyard publish <slug> --provider static` | Build, isolation check, ZIP, upload instructions | No |
| `pnpm protoyard publish <slug> --provider <p> --dry-run` | Build, verify, print the exact deploy command | No |
| `pnpm protoyard publish <slug> --provider <p>` | Build, verify, deploy, print the provider's URL | Yes |

`pnpm protoyard build --all` builds every prototype one after another (for CI
smoke runs).

Options shared by `build`, `export` and `publish`:

| Option | Effect |
| --- | --- |
| `--base <path>` | Public base: `./` (default) or an absolute `/sub/path/` |
| `--include-devtools` | Ship the DevTools panel in this build |
| `--out <dir>` (`build` only) | Custom output folder. Refused if it is, or contains, a source folder (the workspace root, `prototypes/`, `templates/`, `packages/`, `apps/`, `node_modules/`, `.git/`). |
| `--skip-build` (`export` only) | Zip the existing build, after checking every file still matches `build-manifest.json` |

## Artifacts

```text
artifacts/<slug>/
├── dist/                  the static site (served as is)
│   ├── index.html
│   ├── favicon.svg        files from the prototype's public/
│   └── assets/            hashed JS and CSS chunks
├── build-manifest.json    what was built, from what, with checksums
└── <slug>.zip             export / publish --provider static
```

`artifacts/` is git-ignored. After every build the CLI checks that
`index.html` exists, that every local file it references was emitted and that
it loads a JavaScript entry.

### `build-manifest.json`

From a real `crm-demo` build (the `files` list is shortened):

```json
{
  "format": "protoyard.build",
  "formatVersion": 1,
  "slug": "crm-demo",
  "id": "example.crm",
  "version": "0.1.0",
  "builtAt": "2026-10-17T07:19:50.428Z",
  "base": "./",
  "includeDevtools": false,
  "outDir": "artifacts/crm-demo/dist",
  "fileCount": 6,
  "totalBytes": 1212035,
  "files": [
    { "path": "assets/dist-yVFZAMG4.js", "size": 415859, "sha256": "f9018f92…" }
  ],
  "generator": { "name": "@protoyard/cli", "version": "0.1.0" },
  "sdk": { "core": "0.1.0", "runtime": "0.1.0", "rendererSvelte": "0.1.0", "vite": "8.3.4" },
  "node": "26.11.1"
}
```

| Field | Meaning |
| --- | --- |
| `slug`, `id`, `version` | From `protoyard.json` |
| `builtAt` | Build time (metadata only, never used for seeded data) |
| `base`, `includeDevtools` | The settings this build used |
| `outDir` | Workspace-relative when inside the workspace, absolute otherwise |
| `fileCount`, `totalBytes`, `files[]` | Every emitted file with size and SHA-256 |
| `generator`, `sdk`, `node` | CLI, package, Vite and Node versions that produced it |

## Base paths

| Base | Output | Use when |
| --- | --- | --- |
| `./` (default) | Relative URLs (`./assets/index-….js`) | Almost always. The same files work at `/`, `/demos/crm/` or any folder of any host. |
| `/sub/path/` | Absolute URLs (`/protoyard/crm-demo/assets/…`) | A host that requires absolute paths. The site then only works at that exact path. |

The default comes from `build.base` in `protoyard.json` (`./`). A value
without a leading `/`, with `..`, spaces, `?` or `#` is rejected:

```text
$ pnpm protoyard build crm-demo --base sub/
✗ Invalid --base "sub/".
  Use "./" for relocatable output or an absolute path such as "/protoyard/crm-demo/".
```

A missing trailing slash is added (`/protoyard/crm-demo` →
`/protoyard/crm-demo/`). `preview` reads the base from the build manifest and
serves the site at that path.

## Hash routing: no rewrites needed

Prototype routes live after the `#` (`#/deals/42`). The server only ever
serves `index.html` and the assets, so refresh, back, forward and deep links
work on every static host, including a ZIP unpacked into a sub-folder. You do
not need redirect or rewrite rules.

## What a build includes

| Item | Default | Change it |
| --- | --- | --- |
| DevTools panel | **Excluded.** The code is removed from the bundle, not just hidden. | `--include-devtools`, or `"build": { "includeDevtools": true }` in `protoyard.json` |
| "Prototype · simulated data" badge | **Shown** (bottom-left; its tooltip says data is simulated and stored only in this browser) | `"build": { "demoBadge": false }` in `protoyard.json` |
| Faker | In a separate chunk, downloaded only when a world is generated (first visit, scenario load) | |
| Your scenarios and generator | Included, so the first visit can seed the default scenario | |

With DevTools included, visitors can still hide them with `?devtools=0`
(presentation mode). Without them, no URL parameter can bring them back.

Visitors' data lives in their own browser (IndexedDB). Nothing is shared
between visitors, and nothing reaches you. See
[DATABASE.md](DATABASE.md#persistence-caveats).

## The isolation check

`export` and `publish` scan every text asset of the build for another
registered prototype's manifest (its `id`, or its `namespace` as a property)
or its database name (`protoyard.<namespace>.data`). Any match fails the
command with exit code `4`:

```text
✗ The crm-demo bundle contains code from other prototypes.
  <file> references <other-slug> (<other-id>)
```

This catches a prototype importing another prototype's code. On success:

```text
  Isolation: no references to the other 6 registered projects.
```

`build` alone does not run this check.

## Export and the ZIP

```bash
pnpm protoyard export crm-demo
```

```text
✓ Exported crm-demo
  artifacts/crm-demo/crm-demo.zip  385 KB  (6 files)
  sha256 8f371b169525f673624051c6f6ee7d034a3c0ffb3910089df122cf005e458153
  Isolation: no references to the other 6 registered projects.
  Relocatable (base ./): unzip into any folder of any static host.
```

The ZIP contains the contents of `dist/` (no wrapping folder). To use it:

- **Serve it over HTTP.** Opening `index.html` from disk (`file://`) does not
  work: the app loads as a JavaScript module (`<script type="module">`), and
  browsers block module scripts on `file://`. Any static server works, for
  example `python3 -m http.server 8080` inside the unzipped folder.
- **Upload the contents, not the ZIP**, to the host.
- A build with a custom `--base` must be served from that path.

## Preview locally

```bash
pnpm protoyard preview crm-demo            # http://127.0.0.1:4173/
pnpm protoyard preview crm-demo --host     # also on your LAN, for phones
```

It serves the last build, with an SPA fallback (if nothing was built yet, it
stops and tells you to run `build` first), on port `4173` or the next free one (`--strict-port` fails
instead). Each origin has its own data, so the preview starts with a fresh
world even if you edited data in `dev`.

## Publish adapters

`publish` always builds and verifies locally first, then hands the folder to
a provider CLI. It prints only the URL the provider printed; if there is
none, it fails rather than guess one. Tokens and account details are never
printed.

| Provider | `--provider` | Status | Tool |
| --- | --- | --- | --- |
| Cloudflare Pages | `cloudflare` | Supported | Wrangler (not bundled) |
| Static hosting (manual upload) | `static` | Supported | none |
| Netlify | `netlify` | **Experimental**: "implemented but not verified against the real service" | Netlify CLI |
| Vercel | `vercel` | **Experimental**: same | Vercel CLI |

The provider CLI is looked up on `PATH`, then in the workspace's
`node_modules/.bin`, then through `npx --no-install`. Nothing is installed
for you. `pnpm protoyard doctor` shows which ones are available; add
`--offline` to skip the login checks.

| Option | Effect |
| --- | --- |
| `--project <name>` | Provider project or site name. Default `protoyard-<slug>`. |
| `--preview` | Preview deployment (the default) |
| `--production` | Production deployment. Requires `--yes` (or `CI=1`), unless combined with `--dry-run`. |
| `--dry-run` | Build and verify, print the exact command, contact nobody |

### Cloudflare Pages

Dry run first. It needs no account and does not require Wrangler:

```text
$ pnpm protoyard publish crm-demo --provider cloudflare --dry-run
✓ Dry run: crm-demo built and verified (6 files, 1.2 MB).
Would run:
  npx --no-install wrangler pages deploy /…/artifacts/crm-demo/dist --project-name protoyard-crm-demo --branch preview --commit-dirty=true
! Cloudflare Pages CLI not found locally. Install Wrangler (`pnpm add -D wrangler` in your own fork, or `npm i -g wrangler`).
Nothing was uploaded.
```

A real deploy **requires your Cloudflare credentials**:

1. Install Wrangler: `npm i -g wrangler` (or `pnpm add -D wrangler` in your
   own fork).
2. Authenticate, either with `npx wrangler login`, or by setting
   `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the environment.
   The CLI checks login with `wrangler whoami` (or the presence of
   `CLOUDFLARE_API_TOKEN`) and reports only "logged in" or "not logged in".
3. Create the Pages project once:
   `npx wrangler pages project create protoyard-crm-demo --production-branch main`.
   If it is missing, the deploy fails with exactly this hint.
4. Deploy:

```bash
pnpm protoyard publish crm-demo --provider cloudflare                       # preview (branch "preview")
pnpm protoyard publish crm-demo --provider cloudflare --production --yes    # production (branch "main")
```

Preview and production differ only in the branch passed to Wrangler: Pages
treats `main` (the production branch) as production and any other branch as
a preview with its own URL. The printed URL is the last `*.pages.dev` URL in
Wrangler's output.

### Netlify and Vercel (experimental)

Both adapters are implemented but not verified end to end. A dry run says
so:

```text
! The Netlify adapter is experimental and untested against the live service.
Would run:
  netlify deploy --dir /…/artifacts/crm-demo/dist --site protoyard-crm-demo --json
```

| | Netlify | Vercel |
| --- | --- | --- |
| Command | `netlify deploy --dir <dist> --site <project> [--prod] --json` | `vercel deploy <dist> --yes [--prod]` |
| Auth | `netlify login`, or `NETLIFY_AUTH_TOKEN` | `vercel login`, or `VERCEL_TOKEN` |
| `--project` | Passed as `--site` | Validated but **not** passed; the Vercel CLI links the folder to a project itself (interactively or through `VERCEL_PROJECT_ID`) |

After a real deploy the CLI adds: "The adapter is experimental: please
verify the URL loads."

### Static hosting and GitHub Pages

`--provider static` deploys nothing. It builds, checks isolation, writes the
ZIP and prints instructions:

```text
$ pnpm protoyard publish crm-demo --provider static
✓ crm-demo is ready for manual upload: artifacts/crm-demo/crm-demo.zip (385 KB)
Upload the ZIP contents (not the ZIP itself) to any static host:
  • Cloudflare Pages / Netlify: drag the unzipped folder into the dashboard "deploy manually" area.
  • GitHub Pages / S3 / any web server: copy the files into the served folder.
Builds with base "./" work from any folder; a custom --base must match the URL path.
Data lives in each visitor's browser (IndexedDB) — nothing is shared between visitors.
```

For GitHub Pages, copy the contents of `artifacts/<slug>/dist` into the
folder your Pages site serves (for example a sub-folder per prototype). The
default `./` base works under `https://<user>.github.io/<repo>/<any-folder>/`,
and hash routing means no `404.html` trick is needed.

## Deploying the gallery

The gallery is a separate static site that lists prototypes from the
metadata registry. It does not contain the prototypes themselves; publish
those individually.

```bash
pnpm build                              # index + astro check + astro build → apps/gallery/dist
GALLERY_BASE=/protoyard/ pnpm build     # when hosted under a sub-path
pnpm preview                            # preview the built gallery
```

`GALLERY_SITE` sets Astro's `site` option. Hosted, the gallery is read-only:
there is no control server, so it shows the CLI commands instead of starting
dev servers (ADR-013).

## Snapshots and published builds

A published build is a different origin from your dev server, so it starts
with its own data. To show a published prototype in a specific state:

1. In dev, set up the world and download a snapshot (DevTools → Snaps).
2. Open the published URL, then DevTools → Snaps → import → **Import &
   restore**. This needs a build with DevTools (`--include-devtools`).

Snapshots are matched by the manifest `id`, not by URL, so files move freely
between dev, preview and any host of the same prototype. A reproducible link
(`?scenario=…&actor=…&seed=…`) works on any build without DevTools, but only
sets up a seeded world, never edits. See
[SCENARIOS.md](SCENARIOS.md#snapshots).
