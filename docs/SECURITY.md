# Security Model

How to report vulnerabilities: [../SECURITY.md](../SECURITY.md). This page
covers Protoyard's threat model and the rules contributors and agents follow.

## What Protoyard is (and isn't)

- **No server, no accounts, no telemetry.** Prototypes run entirely in the
  browser and store data in IndexedDB. The only network activity is what you
  start yourself: `pnpm install`, and `publish` to a provider.
- **Personas and roles are simulation.** They demonstrate UX. Anyone using the
  browser can open DevTools and change IndexedDB. Policies are enforced in
  services so prototypes *behave* realistically, but this is not access
  control and must never protect real data.
- **SaaS auth, OAuth, MFA and billing are simulations.** They do not authenticate
  users, contact identity providers, provide a second security factor or charge
  money. Accounts, tokens and billing state stay in browser storage. See the
  [SaaS kits guide](SAAS_KITS.md) for each kit's behavior and current limits.
  Simulated passwords are stored as **plain text** in browser storage (exported
  snapshot files blank them). Never type a real password into a
  prototype; sign-up accepts only fictional `example.com` addresses.
- **No real money, identity or personal data.** The demos are fictional.
  `mobile-banking-demo` never collects card or bank details.
- **Avatars are fictional faces.** The 175 library portraits are people the
  repository owner generated with an image generator, not photos of real
  people ([AVATARS](AVATARS.md)). Never add a photo of a real person to the
  library, a prototype, a scenario, a snapshot or a blueprint.

## Trust boundaries

| Boundary | Risk | Mitigation (where) |
| --- | --- | --- |
| CLI ↔ file system | Writing outside the workspace through crafted slugs or `--out` | `checkSlug` (`packages/core/src/slug.ts`) plus `isInside` / path guards (`packages/cli/src/lib/paths.ts`). `new` refuses non-empty folders. `--out` may never point at a source folder. |
| CLI ↔ child processes | Command injection | Argument arrays only, never `shell: true` (`packages/cli/src/lib/{process,vite,dev-server}.ts`) |
| Gallery ↔ local control server | A web page driving your machine | Bound to `127.0.0.1`. The Host header must be `127.0.0.1:<port>` or `localhost:<port>` (DNS-rebinding guard). Every POST needs an Origin on the exact allow-list (default `http://localhost:4321` and `http://127.0.0.1:4321`, plus `--allow-origin`); `Origin: null` and missing origins are refused. Only slugs from the registry (prototypes and templates, never blueprints) are started or copied (`packages/cli/src/control-server.ts`). **Creating is off by default.** With `--allow-create`, `POST /api/new` **writes** a new `prototypes/<slug>/` folder (never over existing files), runs `pnpm install --offline`, runs the copied prototype's code to fill its spec, and starts its dev server. It accepts only `application/json` bodies up to 8 KB with a strict schema, and an `X-Protoyard-Token` header that matches a random token generated per run (compared in constant time). The server hands that token only to allowed origins through `GET /api/status`, so treat any page on an allowed origin as able to create prototypes and run their code. Never add an origin you do not fully control. |
| Blueprints ↔ generated code | A crafted `blueprint.json` injecting code into `src/generated/**` | Blueprints are data only (ADR-017): JSON, 1 MB limit for `generate` and 256 KB for catalog files in `blueprints/`, validated by `@protoyard/blueprint`. Names are restricted to kebab-case or lowerCamelCase, and every other value reaches code only as a `JSON.stringify` string literal (`packages/cli/src/lib/codegen/`). Writes stay under `prototypes/<slug>/` (`childPath` + `isInside`, staged then renamed). |
| CSV and file uploads ↔ browser data | Oversized or malicious files, spreadsheet formulas | CSV import: 2 MB and 10,000 rows, parsed as text and validated row by row through the entity services. CSV export prefixes cells that start with `= + - @` (`packages/blueprint/src/csv.ts`). Uploads: size, type and quota checked in the service, bytes stored in IndexedDB, previews only as `<img>` for `image/*`; uploaded files are never opened as HTML. |
| Theme import ↔ appearance | Malformed theme files | 64 KB limit, `JSON.parse` only, `ThemeSchema` on import, save and every boot; values are applied with `style.setProperty` on `--py-*` names only. |
| Static outputs (showcase, review index) ↔ public internet | Shipping markup or links from untrusted strings | `showcase` and `review-index` write only to `artifacts/` (or a marked folder with `--allow-external-out`). The review page escapes all text, has no script, and links only `https:`/`http:` URLs recorded in the deploy ledger. `review-index --publish` uploads only `artifacts/review` unless `--allow-publish-out` is passed, never a folder that holds the deploy ledger, and refuses folders with files it did not write. |
| CI templates ↔ repository secrets | Leaking a provider token, injecting into workflows | `protoyard ci init` writes workflows whose actions are pinned to commit SHAs, with `contents: read` and `persist-credentials: false`. `--prototypes` must list registry slugs, so no other text reaches the YAML or its shell steps. `protoyard-preview.yml` skips fork pull requests but still runs same-repository pull request code next to `CLOUDFLARE_API_TOKEN`. Use a token limited to Cloudflare Pages: Edit on one account, store it as an environment secret with required reviewers, and rotate it when collaborators change. |
| AI voice ↔ microphone and speech | Recording or uploading audio | The voice panel never requests the microphone by default. The optional level meter reads amplitude only with Web Audio and never records, stores or uploads audio. Spoken replies use the browser's `speechSynthesis`, which may use a network voice depending on the browser and the selected voice. |
| Simulated passwords ↔ browser storage | A reviewer types a real password into a SaaS demo | Simulated auth stores what is typed as **plain text** in IndexedDB (readable by other prototypes on the same origin). Every password field warns "do not use a real password" and uses `autocomplete="off"`. Exported snapshot files blank `simulatedPassword`; in-browser saved snapshots keep it so an in-place restore still signs in. Never enter a real password in a prototype. |
| Avatar sources ↔ `<img>` | A persona or record `avatar` from a snapshot loading a script URL or tracking off-origin | `PersonaAvatarSchema` / `isPersonaAvatar` (`packages/core/src/session.ts`) accept only a library id (`av-NNN`), an `https://` URL without credentials, or a root-relative `/path`, at most 2048 characters. `avatarImage()` (`packages/renderer-svelte/src/avatars.ts`) re-checks values, since snapshot imports do not re-validate personas. The ui `Avatar` checks `src` and every `srcset` candidate again (`packages/ui/src/lib/image-source.ts`) and refuses `javascript:`, `data:`, `http:`, `blob:` and any other non-https scheme, `//host`, whitespace, quotes, backslashes and control characters. A refused or broken source shows initials. Values only reach `src` / `srcset` attributes, never markup. An allowed `https://` avatar still contacts that host when it renders, so keep seeded avatars on library ids. |
| Indexing ↔ prototype code | Running untrusted code just to list it | `index` reads data-only `protoyard.json` files and validates them with zod. **No prototype code runs** (ADR-003). |
| Snapshot import ↔ browser data | Malformed or malicious files | `parseSnapshotText` / `validateSnapshot`: JSON only, 25 MB limit, strict schema, prototype id must match, newer schemas rejected. Import is validated before anything is written, and failures leave current data untouched. Snapshots are never evaluated, and strings render as escaped text. |
| Prototype ↔ prototype (same origin) | One app reading another's IndexedDB | **Not prevented.** Database names are namespaces, not a security boundary. Serve untrusted prototypes from separate origins. |
| Builds ↔ public internet | Shipping author-only controls or secrets | DevTools are excluded by default (`--include-devtools` to opt in). Builds contain no environment secrets, and the export isolation check confirms no other prototype's code is bundled. |
| Publish ↔ providers | Leaking tokens | Provider CLIs read their own credentials. Protoyard never prints tokens or stores them in builds or logs, and `--dry-run` contacts nobody. |

## Running someone else's prototype

These commands run prototype code, like any `npm` script: `dev`, `build`,
`validate` (with or without `--build`), `spec`, `snapshot`, every `scenario`
subcommand, `review-index`, `budget`, `export`, `showcase`, `publish`, `new`
(it fills the new prototype's spec from its definition), and the gallery's
"Create" button (`POST /api/new`, only with `--allow-create`). Only `index`
and `list` read data-only files without running code (ADR-003). Review
prototypes, templates and blueprints from untrusted sources before running
any of these, exactly as you would any repository.

## Rules for contributors and agents

- Never commit secrets, tokens, `.env` files, real personal data, real
  company data or real financial data. Use `.example` / `example.com` domains.
- Never use `{@html}`, `eval` or `new Function` on user or snapshot data.
- Never weaken the path guards, the control server's binding or Origin checks,
  or snapshot validation without a security review.
- Never run a real `publish` without the developer's explicit authorization
  and their own credentials.
- Never add an `--allow-origin` you do not fully control: with
  `--allow-create`, allowed origins can create prototypes and run their code
  through the control server. Turn `--allow-create` on only while you use the
  gallery's create flow.
- `publish` without `--dry-run` uploads a public preview immediately (also with
  `--all`); only `--production` asks for `--yes`.
- Keep docs honest. Do not describe simulated roles as authentication, or
  browser storage as durable, encrypted or compliant.

## Data durability

Browser storage can be cleared by the user, private browsing, quota pressure
or eviction. The runtime reports degraded storage honestly (an in-memory
fallback with a visible banner). Export snapshots for anything worth keeping.
