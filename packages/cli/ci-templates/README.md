# GitHub Actions templates

These versioned templates are starter workflows for teams using Protoyard in a
GitHub repository. `pnpm protoyard ci init --with <ids>` renders them into
`.github/workflows/`, replacing `{{NODE_VERSION}}`, `{{PROTOTYPES}}` and
`{{PROVIDER}}` (`--dry-run` first shows the diff). The templates use the same 40-character SHA-pinned actions as
the repository CI workflow.

| Template | Triggers and work | Secrets | Expected cost |
| --- | --- | --- | --- |
| `protoyard-check.yml` | Pull requests, pushes to `main`, and manual runs; installs dependencies and runs workspace lint, typecheck, and tests. | None. | One full workspace install and test run per event; typically the broadest routine check. |
| `protoyard-build.yml` | Pull requests run `validate --build`, `export --skip-build` and `budget --skip-build` for each slug returned by `protoyard affected`, so each affected prototype is built once and nothing is built when none is affected. Pushes to `main` and manual runs use `build --all`, then `export --all --skip-build` and `budget --all --skip-build` (prototypes only; `build --all` continues past per-slug failures and exits 1 if any failed). Uploads generated ZIPs for seven days. | None. | One build per affected prototype on a PR, or one build of every prototype on `main` and manual runs. |
| `protoyard-e2e.yml` | Pull requests select affected prototypes, pushes to `main` select all prototypes, and manual runs use the rendered prototype list. Installs or reuses the Chromium browser cache and runs Playwright. | None. | Browser install on a cache miss and a 30-minute maximum Playwright job; actual duration depends on the E2E matrix. |
| `protoyard-preview.yml` | Pull request open, synchronize, or reopen. Installs Wrangler at a pinned exact version (`npm install --global wrangler@4.146.0`), then publishes affected prototypes to Cloudflare preview branches named `pr-<number>` with `--ensure-project`, so the first preview creates each `protoyard-<slug>` Pages project. Each run uploads public `*.pages.dev` previews immediately. Fork pull requests are skipped. The job runs in the `protoyard-preview` environment. | `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, as secrets of the `protoyard-preview` environment (see below). | Builds and uploads each affected prototype; Cloudflare usage or billing depends on the account plan and deployment volume. |

The check and build workflows are suitable for required status checks after a
team installs them. Preview deployment is opt-in: add the workflow and its two
Cloudflare secrets only when the repository is ready to publish previews. No
workflow edits repository settings or deploys production.

### Preview secrets

The preview job builds the pull request's own code (its Vite config, and the
CLI itself) while `CLOUDFLARE_API_TOKEN` is in its environment. Forks are
skipped, but anyone who can push a branch to the repository can read the token
from a build. Limit what that token can do:

- Create a Cloudflare API token with only **Account → Cloudflare Pages: Edit**
  on one account. Never use a global API key.
- Store `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as secrets of the
  `protoyard-preview` **environment** (Settings → Environments), not as
  repository secrets, and add **required reviewers**, so every preview run
  waits for a person to approve it before it can see them.
- Rotate the token whenever collaborators with push access change.

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
