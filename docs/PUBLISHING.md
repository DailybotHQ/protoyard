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
| `pnpm protoyard publish <slug> --provider <p>` | Build, verify, **deploy a preview immediately** (no prompt), print the provider's URL | Yes |
| `pnpm protoyard publish <slug> <slug>… \| --all \| --tag <tag> --provider <p> [--dry-run]` | The same for several prototypes, one after another, with one summary | Only without `--dry-run` |
| `pnpm protoyard publish --history [<slug>…] [--provider <p>] [--limit <n>]` | Print the last recorded publishes from the local ledger | No |
| `pnpm protoyard review-index [--from-ledger \| --slugs a,b]` | One static page linking every real deployment, with scenario and persona links | No |
| `pnpm protoyard review-index --publish <p> [--project <name>] --dry-run` | Generates the review page and prints the provider command for that directory | No |
| `pnpm protoyard review-index --publish <p> [--project <name>]` | Generates and deploys the review page through the provider adapter | Yes |

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
| `bundle` | gzip (level 9) bytes: `initialJsGzip` (entry chunks and their static imports), `lazyJsGzip` (chunks loaded through `import()`, such as Faker), `cssGzip`, `totalGzip` (every file), and `chunks[]` (`file`, `kind`: `initial`, `lazy` or `css`, `gzip`). Computed from Vite's chunk manifest, which is then deleted from `dist`. Absent when the prototype's `vite.config.ts` does not use `defineProtoyardConfig`. `build` prints the same figures. |

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
| "Prototype · simulated data" badge | **Shown** (below the frame, or in a corner free of controls when full-bleed; its tooltip says data is simulated and stored only in this browser) | `"build": { "demoBadge": false }` in `protoyard.json` |
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
| `--dry-run` | Build and verify, print the exact command, contact nobody. **Without it, `publish` uploads immediately**: a preview needs no confirmation, also with `--all` or `--tag`; only `--production` asks for `--yes`. Run `--dry-run` first when you only want to check. |
| `--branch <name>` | Cloudflare only: a named preview branch (lowercase letters, digits and dashes; `main` is reserved), so each pull request or reviewer gets its own preview URL. Refused with `--production` and by the other adapters. |
| `--ensure-project` | Cloudflare only: create the Pages project when it is missing. A dry run lists the `wrangler pages project create` command first. A real publish runs `wrangler pages project list --json` and creates the project only when its name is absent. |
| `--history [<slug>…] [--limit <n>]` | Print the deploy ledger instead of publishing (see below) |

### Publishing several prototypes

Pass several slugs, `--all` (every prototype) or `--tag <tag>` (every
prototype with that tag). Templates are never included. Each prototype is
built, checked for isolation and handed to the provider in turn, exactly as a
single publish, and the batch continues past a failure:

```bash
pnpm protoyard publish --all --provider cloudflare --dry-run
pnpm protoyard publish crm-demo mobile-banking-demo --provider static
pnpm protoyard publish --tag review --provider cloudflare            # real deploys: your credentials
```

A dry run over every prototype (2026-10-18, Vite's build lines omitted):

```text
$ pnpm protoyard publish --all --provider cloudflare --dry-run
✓ mobile-banking-demo             3.1 s  would run npx --no-install wrangler pages deploy /…/artifacts/mobile-banking-demo/dist --project-name protoyard-mobile-banking-demo --branch preview --commit-dirty=true
✓ support-widget-demo             3.0 s  would run npx --no-install wrangler pages deploy /…/artifacts/support-widget-demo/dist --project-name protoyard-support-widget-demo --branch preview --commit-dirty=true
✓ nova-assistant-demo             3.0 s  would run npx --no-install wrangler pages deploy /…/artifacts/nova-assistant-demo/dist --project-name protoyard-nova-assistant-demo --branch preview --commit-dirty=true
✓ crm-demo                        3.2 s  would run npx --no-install wrangler pages deploy /…/artifacts/crm-demo/dist --project-name protoyard-crm-demo --branch preview --commit-dirty=true
✓ ui-kit                          3.2 s  would run npx --no-install wrangler pages deploy /…/artifacts/ui-kit/dist --project-name protoyard-ui-kit --branch preview --commit-dirty=true
✓ ai-chat-demo                    2.9 s  would run npx --no-install wrangler pages deploy /…/artifacts/ai-chat-demo/dist --project-name protoyard-ai-chat-demo --branch preview --commit-dirty=true
! Cloudflare Pages CLI not found locally. Install Wrangler (`pnpm add -D wrangler` in your own fork, or `npm i -g wrangler`).
Nothing was uploaded.
All 6 prototypes verified.
```

The output is one line per prototype (time, then the URL the provider
printed, the command a dry run would run, the ZIP, or the error), and the
exit code is `1` if any prototype failed. With `--json`, `data` is
`{ provider, target, dryRun, total, failed, results[] }`, with one
`{ slug, ok, durationMs, project, kind, url | command | zip, error }` entry
per prototype.

Unknown slugs and tags fail before anything is built. Each prototype uses its
default project (`protoyard-<slug>`), so `--project` is refused when there is
more than one target. `--production` still requires `--yes` and is checked
once, up front. One slug keeps the single-publish output.

### The deploy ledger

Every publish that completes (a real deploy, a dry run or a static ZIP)
appends one JSON line to `artifacts/publish/ledger.jsonl` (git-ignored,
local to your checkout). Failed publishes are not recorded.

```text
$ pnpm protoyard publish --history
2026-10-18T01:54:42.075Z  crm-demo                 cloudflare preview           dry run, nothing uploaded e2d7ba6+dirty
```

| Field | Meaning |
| --- | --- |
| `format`, `formatVersion` | `protoyard.publish-ledger`, `1` |
| `at` | When the publish completed |
| `slug`, `provider`, `target`, `branch`, `project` | What was published, where, and to which preview branch (`null` when none) |
| `kind`, `dryRun` | `published`, `dry-run` or `static` |
| `url`, `deploymentId` | Only for a real deploy, and only what the provider printed. Always `null` for dry runs and ZIPs. |
| `commit`, `dirty` | `git rev-parse HEAD` of the workspace and whether tracked files had uncommitted changes (`null` outside git) |
| `buildSha256`, `fileCount`, `totalBytes` | sha256 over the built files' paths and hashes (it identifies the exact build), plus its size |
| `zip`, `zipSha256` | The static provider's ZIP |

Each line is validated before it is written, and written in a single append,
so concurrent publishes never interleave inside a line. The schema is
strict: tokens, account ids and provider output are never recorded, and any
field whose name looks like a credential is refused. `--history` shows the
last 20 entries, oldest first. Filter with slugs or `--provider`, change the
count with `--limit`, and add `--json` for `{ ledger, total, shown, skipped,
entries }`. Lines that are not valid entries are skipped and counted. If the
ledger cannot be written, the publish still reports its result, with a
warning and `ledger: null`.

### The team review index

`pnpm protoyard review-index` writes one static page for reviewers,
`artifacts/review/index.html`, plus `review-manifest.json` (the same data as
JSON). For each prototype it shows the name, description and icon, then:

- **Deployed** (the deploy ledger has a real publish): the URL the provider
  printed, target and preview branch, publish time and commit, one link per
  scenario (`?scenario=<id>`), and one per persona of the default scenario
  (`?actor=<id>`, at most 12).
- **Not deployed**: a "not deployed" badge and the command to publish it.
  No URL is ever guessed. Dry runs and ZIPs do not count as deployments.

```bash
pnpm protoyard review-index                          # every prototype
pnpm protoyard review-index --from-ledger            # only prototypes with a real deploy
pnpm protoyard review-index --slugs crm-demo,mobile-banking-demo --title "Sprint 12 review"
```

| Option | Effect |
| --- | --- |
| `--out <dir>` | Output folder (default `artifacts/review`, same safety rules as `build --out`) |
| `--base <path>` | Public base of the review page itself (`./` or `/sub/path/`), used for its link to `review-manifest.json` |
| `--provider <p>` | Provider named in the publish command for undeployed prototypes (default `cloudflare`) |
| `--no-personas` | Skip persona links. Persona ids come from running each deployed prototype's generator for its default scenario in a child process, as `validate` does. |

The page has no JavaScript and no external requests: plain HTML with inline
CSS using the default theme's tokens, light and dark. All text is escaped. The
same ledger and registry produce the same bytes, so the page can be committed
or diffed. Publishing the page is optional. Use `--publish cloudflare --dry-run`
to inspect the exact upload command without contacting Cloudflare, then omit
`--dry-run` only when you intend to deploy. The default Pages project is
`protoyard-review`; an explicit `--project` overrides it. `--production`
targets the production branch and requires `--yes`. The local empty
`.protoyard-review` ownership marker is temporarily removed for upload and
restored afterward. Add `--no-personas` to skip generator runs when a faster
index is more useful than persona deep links.

```bash
pnpm protoyard review-index --publish cloudflare --dry-run --no-personas
```

### Cloudflare Pages

Dry run first. It needs no account and does not require Wrangler (output of
2026-10-18; Vite's build lines omitted):

```text
$ pnpm protoyard publish crm-demo --provider cloudflare --dry-run
✓ Dry run: crm-demo built and verified (46 files, 1.4 MB).
Would run:
  npx --no-install wrangler pages deploy /…/artifacts/crm-demo/dist --project-name protoyard-crm-demo --branch preview --commit-dirty=true
! Cloudflare Pages CLI not found locally. Install Wrangler (`pnpm add -D wrangler` in your own fork, or `npm i -g wrangler`).
Nothing was uploaded.
```

A named preview branch and the project setup, in one dry run:

```text
$ pnpm protoyard publish crm-demo --provider cloudflare --branch pr-42 --ensure-project --dry-run
✓ Dry run: crm-demo built and verified (46 files, 1.4 MB).
Would run:
  npx --no-install wrangler pages project create protoyard-crm-demo --production-branch main
  npx --no-install wrangler pages deploy /…/artifacts/crm-demo/dist --project-name protoyard-crm-demo --branch pr-42 --commit-dirty=true
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
   `npx wrangler pages project create protoyard-crm-demo --production-branch main`,
   or pass `--ensure-project` to let `publish` create it when it is missing.
   Without either, a deploy to a missing project fails with exactly this hint.
4. Deploy:

```bash
pnpm protoyard publish crm-demo --provider cloudflare                       # preview (branch "preview")
pnpm protoyard publish crm-demo --provider cloudflare --production --yes    # production (branch "main")
pnpm protoyard publish crm-demo --provider cloudflare --branch pr-42         # preview with its own alias
```

These real deploys have not been run in this repository's own checks: they
need the owner's Cloudflare credentials. Only dry runs are verified here.

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

## CI/CD templates for prototype teams

`protoyard ci init` copies versioned GitHub Actions workflows from
`packages/cli/ci-templates/github/` into `.github/workflows/` of your
repository. It only writes files: repository settings, secrets and branch
protection are never changed, and it prints secret **names**, never values.
The templates and what each one costs are described in
[packages/cli/ci-templates/README.md](../packages/cli/ci-templates/README.md).

| Workflow | `--with` | What it runs |
| --- | --- | --- |
| `protoyard-check.yml` | `check` | lint, typecheck and tests |
| `protoyard-build.yml` | `build` | `validate --build`, then `export` and `budget` on that same build (`--skip-build`), for the prototypes a pull request affects; all prototypes on `main` |
| `protoyard-e2e.yml` | `e2e` | Playwright on the affected prototypes |
| `protoyard-preview.yml` | `preview` | Installs Wrangler at a pinned version, then publishes a Cloudflare preview per pull request (`--branch pr-<number> --ensure-project`), skipped for forks. It uploads on every run. It needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the `protoyard-preview` environment (see below). |

```text
$ pnpm protoyard ci init --with check --dry-run
✓ CI init dry run: 1 file(s) for github
  create .github/workflows/protoyard-check.yml

Required secrets (names only — never values):
  (none for the selected workflows)

Manual one-time steps:
  • Settings are not changed by this command.
  • Review the generated workflow files, then commit them on a branch.
  • Ensure GitHub Actions is enabled for the repository (Settings → Actions).
  • Optionally mark the check/build workflows as required status checks after the first green run.

Nothing was written (--dry-run).
```

**Preview secrets.** The preview job builds pull request code while the
Cloudflare token is in its environment, so anyone who can push a branch can
read it. Create a token limited to **Account → Cloudflare Pages: Edit** on one
account, store both values as secrets of the `protoyard-preview`
**environment** (Settings → Environments) with **required reviewers**, so each
preview run waits for approval, and rotate the token when collaborators
change. `ci init --with preview` prints these steps; it never configures them.

`--dry-run` also prints a unified diff per file (omitted above). Existing
files are refused without `--force`. Each scaffolded file carries
`# protoyard-ci-template: <id> v<N>` and `# protoyard-ci-hash: <sha256>`, so
`pnpm protoyard ci check` can report each workflow as up-to-date, outdated
(a newer template ships), modified (edited since `ci init`), unhashed or
unmanaged. `--strict` exits 4 on drift; `pnpm protoyard doctor` mentions
outdated workflows. In this repository, which has no scaffolded workflows:

```text
$ pnpm protoyard ci check
No scaffolded workflows (.github/workflows/protoyard-*.yml). Run `pnpm protoyard ci init`.
```

The build, e2e and preview templates select prototypes with
`protoyard affected`, which maps `git diff --name-only <ref>...HEAD` to
slugs: a change under `prototypes/<slug>/` affects that prototype, and a
change to shared code (`packages/`, `templates/`, root configuration)
affects all of them. Only indexed prototypes are selected: a changed
`prototypes/<name>/` folder that is not in the registry (deleted, renamed, or
without a valid manifest) is listed under `skipped` in `--json` and never
appears in the CSV, so a pull request that deletes a prototype stays green:

```text
$ pnpm protoyard affected --since HEAD~1
✓ Affected all prototypes (shared change) since HEAD~1 (7 path(s), 32.5 ms)
  ai-chat-demo  (packages)
  crm-demo  (packages)
  mobile-banking-demo  (packages)
  nova-assistant-demo  (packages)
  support-widget-demo  (packages)
  ui-kit  (packages)
  csv: ai-chat-demo,crm-demo,mobile-banking-demo,nova-assistant-demo,support-widget-demo,ui-kit
$ pnpm protoyard affected --since HEAD~1 --format csv
ai-chat-demo,crm-demo,mobile-banking-demo,nova-assistant-demo,support-widget-demo,ui-kit
```

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

## The showcase: gallery + live demos as one site

`pnpm build:showcase` (that is, `pnpm protoyard showcase`) builds **one static
site**, written to `artifacts/showcase/`. It contains the gallery and its
marketplace, plus a live, read-only demo of every product type:

- every prototype's own static build at `<base>p/<slug>/app/`;
- every template as a demo at `<base>t/<name>/app/`, built with the same
  `template-demo-<name>` storage namespace as `protoyard dev <template>`, so
  visitors' demo data never shares the template's own namespace.
  `--no-templates` leaves the templates out (`--include-templates` is still
  accepted and changes nothing, since templates are bundled by default).

Blueprints are listed in the marketplace with their `protoyard generate`
command, but they have no app until they are generated, so they are not
bundled. In the published site, each marketplace page
(`<base>marketplace/<kind>/<slug>/`) plays its bundled demo under **Try it**.
Live preview iframes, **Open** links and `?scenario=<id>` links work with no
local control server. **Use this template** and **Remix** show the exact CLI
command, because the hosted site is read-only. Every demo still passes its own
isolation check and keeps its own performance budget. DevTools are included,
because a showcase is a demo site. Preview it with
`pnpm protoyard showcase --base /protoyard/ --serve`, then open
`http://127.0.0.1:4500/protoyard/`.

The `--json` result lists every demo in `targets`: kind, slug, `appPath`, its
`marketplacePath`, the `storageNamespace` of template demos, and whether it
built (`ok`) with its size.

### Publish the showcase to Cloudflare Pages

Publish the built gallery and every prototype and template demo as one Pages project:

```bash
pnpm protoyard showcase --publish cloudflare --dry-run
pnpm protoyard showcase --publish cloudflare --project protoyard-showcase --branch team-review
```

The first command builds and verifies the showcase, then prints the exact
Wrangler command without contacting Cloudflare. Review it before running the
second command with authorized Wrangler credentials. Deploys use the preview
branch by default; `--branch` selects a named preview. The build refuses to
publish if any selected prototype or template fails to build or fails its
isolation check.
The local `.protoyard-showcase` ownership marker is restored after publishing
and is never included in the uploaded site. This one-project option is useful
for team review; per-prototype projects remain available through `protoyard
publish --all`.

### Hosting the showcase on GitHub Pages

1. One time: **Settings → Pages → Source: GitHub Actions**.
2. **Actions → pages → Run workflow.** `base` defaults to `/protoyard/`, the
   project path. Use `/` for a user or organization site, or a custom domain.
3. The workflow ([.github/workflows/pages.yml](../.github/workflows/pages.yml))
   runs `pnpm protoyard showcase --base <base>` and deploys with
   `actions/deploy-pages`. **It never runs on push.** Publishing a public site
   is an explicit, manual decision.

The build fails if any prototype fails to build or fails the isolation
check, so a broken demo is never deployed silently. Every visitor's data
lives in their own browser (IndexedDB per origin, one database set per
prototype namespace), and nothing is shared between visitors.

## Offline (optional)

Set `"build": { "offline": true }` in `protoyard.json`, or build with
`--offline`, to add a small service worker
([`@protoyard/offline`](../packages/offline/README.md)) to the export. After
one online visit, the app shell (HTML, JS, CSS, images) loads with no
network. Prototype data was already local in IndexedDB.

- HTML is network-first. Content-hashed assets are cache-first.
- Each deploy gets a new version, which waits until every tab is closed (or
  until `window.__protoyardOffline.applyUpdate()` is called).
- `?offline=0` unregisters the service worker for that scope only.

It requires HTTPS or localhost, and the first visit must be online. Browsers
(especially Safari) may still evict caches and storage, so export snapshots
of anything worth keeping.

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
