# GitHub Actions templates

These versioned templates are starter workflows for teams using Protoyard in a
GitHub repository. `pnpm protoyard ci init --with <ids>` renders them into
`.github/workflows/`, replacing `{{NODE_VERSION}}`, `{{PROTOTYPES}}` and
`{{PROVIDER}}` (`--dry-run` first shows the diff). The templates use the same 40-character SHA-pinned actions as
the repository CI workflow.

| Template | Triggers and work | Secrets | Expected cost |
| --- | --- | --- | --- |
| `protoyard-check.yml` | Pull requests, pushes to `main`, and manual runs; installs dependencies and runs workspace lint, typecheck, and tests. | None. | One full workspace install and test run per event; typically the broadest routine check. |
| `protoyard-build.yml` | Pull requests validate and export only slugs returned by `protoyard affected`; pushes to `main` and manual runs use `build --all` and `export --all`. Enforces configured budgets and uploads generated ZIPs for seven days. | None. | Builds and exports each affected prototype on a PR, or every prototype on `main` and manual runs; may use significant runner time for large workspaces. |
| `protoyard-e2e.yml` | Pull requests select affected prototypes, pushes to `main` select all prototypes, and manual runs use the rendered prototype list. Installs or reuses the Chromium browser cache and runs Playwright. | None. | Browser install on a cache miss and a 30-minute maximum Playwright job; actual duration depends on the E2E matrix. |
| `protoyard-preview.yml` | Pull request open, synchronize, or reopen; publishes affected prototypes to Cloudflare preview branches named `pr-<number>`. Fork pull requests are skipped. | `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, configured as repository or environment secrets. | Builds and uploads each affected prototype; Cloudflare usage or billing depends on the account plan and deployment volume. |

The check and build workflows are suitable for required status checks after a
team installs them. Preview deployment is opt-in: add the workflow and its two
Cloudflare secrets only when the repository is ready to publish previews. No
workflow edits repository settings or deploys production.

The build template calls `pnpm protoyard budget` as the performance gate: it
fails when a prototype's initial JS or CSS exceeds `protoyard.budgets.json`
(see [docs/PERFORMANCE.md](../../../docs/PERFORMANCE.md#versioned-budgets)).

## Versions and drift

Line 1 of every template is `# protoyard-ci-template: <id> v<N>`. Bump `N`
whenever a template changes in a way teams should pick up (action pins,
steps, triggers). `protoyard ci init` adds a second line,
`# protoyard-ci-hash: <sha256>`, the hash of the rendered file without that
line. `protoyard ci check` uses both: a hash mismatch means the file was
edited after `ci init`, and a lower `vN` than the packaged template means an
update is available. Updating is explicit: `ci init --with <ids> --dry-run`,
then `--force`.
