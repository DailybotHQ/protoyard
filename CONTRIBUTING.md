# Contributing to Protoyard

Thanks for helping. Protoyard is a pnpm workspace: an engine (`packages/*`), a
gallery (`apps/gallery`), templates and demo prototypes. Read
[AGENTS.md](AGENTS.md) for the rules, whether you are a person or a coding
agent; it is short.

## Setup

You need Node.js 24 (CI uses 24.20.0) and pnpm 11 through Corepack.

```bash
git clone https://github.com/DailybotHQ/protoyard
cd protoyard
corepack enable
pnpm install
pnpm dev                     # gallery + local control server
pnpm protoyard dev crm-demo  # run one prototype
```

## The gate

Run these before opening a pull request. CI runs the same checks.

```bash
pnpm lint                    # Biome: lint + format check
pnpm typecheck               # tsc / svelte-check / astro check per package
pnpm test                    # Vitest unit + integration
pnpm test:e2e                # Playwright (run `pnpm test:e2e:install` once)
pnpm protoyard validate crm-demo
pnpm protoyard export crm-demo
```

[docs/TESTING_GUIDE.md](docs/TESTING_GUIDE.md) has the scoped commands and the
map from source to tests. A behavior change comes with a test.

## What we look for

- **Real behavior.** No dead buttons, no fake success, and no placeholder
  screens. Empty, loading and error states exist.
- **Determinism.** Generators never call `Math.random()` or `Date.now()`.
- **Isolation.** A change to one prototype never edits another's folder. The
  platform never assumes domain entities.
- **Accessibility.** Labels, keyboard support, visible focus and AA contrast in
  both light and dark mode.
- **Honesty.** Docs describe what works today. Roadmap items are labeled as
  such, and benchmarks are measured.
- **English only** in code, comments, UI and docs.

## Commits and pull requests

Use [Conventional Commits](https://www.conventionalcommits.org/):
`type(scope): description`. Scopes: `core`, `database`, `scenarios`, `runtime`,
`themes`, `ui`, `devtools`, `renderer`, `cli`, `gallery`, `templates`,
`crm-demo`, `mobile-banking-demo`, `ai-chat-demo`, `docs`, `ci`, `deps`.

Keep pull requests focused, fill in the template, and link the issue.

## Adding a prototype or template

See [docs/AGENT_GUIDE.md](docs/AGENT_GUIDE.md). In short: run
`pnpm protoyard new <slug> --template <name>`, implement real services, add
scenarios, then `validate` and `build`.

## Code of conduct and security

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md). Report
vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).
