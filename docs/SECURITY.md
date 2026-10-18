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
- **No real money, identity or personal data.** The demos are fictional.
  `mobile-banking-demo` never collects card or bank details.

## Trust boundaries

| Boundary | Risk | Mitigation (where) |
| --- | --- | --- |
| CLI ↔ file system | Writing outside the workspace through crafted slugs or `--out` | `checkSlug` (`packages/core/src/slug.ts`) plus `isInside` / path guards (`packages/cli/src/lib/paths.ts`). `new` refuses non-empty folders. `--out` may never point at a source folder. |
| CLI ↔ child processes | Command injection | Argument arrays only, never `shell: true` (`packages/cli/src/lib/{process,vite,dev-server}.ts`) |
| Gallery ↔ local control server | A web page driving your machine | Bound to `127.0.0.1`, exact-Origin allow-list, only slugs from the registry, no file-writing endpoints (`packages/cli/src/control-server.ts`) |
| Indexing ↔ prototype code | Running untrusted code just to list it | `index` reads data-only `protoyard.json` files and validates them with zod. **No prototype code runs** (ADR-003). |
| Snapshot import ↔ browser data | Malformed or malicious files | `parseSnapshotText` / `validateSnapshot`: JSON only, 25 MB limit, strict schema, prototype id must match, newer schemas rejected. Import is validated before anything is written, and failures leave current data untouched. Snapshots are never evaluated, and strings render as escaped text. |
| Prototype ↔ prototype (same origin) | One app reading another's IndexedDB | **Not prevented.** Database names are namespaces, not a security boundary. Serve untrusted prototypes from separate origins. |
| Builds ↔ public internet | Shipping author-only controls or secrets | DevTools are excluded by default (`--include-devtools` to opt in). Builds contain no environment secrets, and the export isolation check confirms no other prototype's code is bundled. |
| Publish ↔ providers | Leaking tokens | Provider CLIs read their own credentials. Protoyard never prints tokens or stores them in builds or logs, and `--dry-run` contacts nobody. |

## Running someone else's prototype

`protoyard dev`, `build`, `validate --build` and `scenario validate` run
prototype code, like any `npm` script. Review prototypes from untrusted
sources before running them, exactly as you would any repository.

## Rules for contributors and agents

- Never commit secrets, tokens, `.env` files, real personal data, real
  company data or real financial data. Use `.example` / `example.com` domains.
- Never use `{@html}`, `eval` or `new Function` on user or snapshot data.
- Never weaken the path guards, the control server's binding or Origin checks,
  or snapshot validation without a security review.
- Never run a real `publish` without the developer's explicit authorization
  and their own credentials.
- Keep docs honest. Do not describe simulated roles as authentication, or
  browser storage as durable, encrypted or compliant.

## Data durability

Browser storage can be cleared by the user, private browsing, quota pressure
or eviction. The runtime reports degraded storage honestly (an in-memory
fallback with a visible banner). Export snapshots for anything worth keeping.
