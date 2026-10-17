---
name: publish-prototype
description: Publish a Protoyard prototype to a static host — always a dry run first, and a real Cloudflare Pages (wrangler) or other provider deploy only with the developer's explicit authorization.
version: "1.0.0"
user-invocable: true
allowed-tools: Bash, Read, Grep, Glob
# === Documentation (ignored by harnesses, useful for humans) ===
tier: standard
intent: deploy
max-files: 0
---

# Skill: Publish a prototype

## Goal

Deploy one prototype's static build through a provider adapter
(`packages/cli/src/publish/`: `cloudflare`, `netlify`, `vercel`, `static`)
and report exactly what the provider reported (ADR-014 in
`docs/DECISIONS.md`).

## When to use

- The developer asks to put a prototype online. Never on your own initiative.

## Inputs

- `slug`, `provider` (default recommendation: `cloudflare`), optional
  `--project <name>` (default `protoyard-<slug>`), preview or production.

## Steps

1. **Validate first.** Run the `validate-and-export` skill; stop on any
   failure.
2. **Hygiene.** `bash scripts/check-public-hygiene.sh` must report no hits
   before anything leaves the machine.
3. **Dry run (always allowed).**
   ```bash
   pnpm protoyard publish <slug> --provider cloudflare --dry-run
   ```
   It builds, verifies, and prints the exact provider command it would run
   (for Cloudflare, `wrangler pages deploy …`), contacting no provider.
   `pnpm protoyard doctor` shows whether the provider CLI is installed and
   authenticated, without printing secrets.
4. **Ask for authorization.** Present the dry-run output and name the exact
   command that needs approval, for example
   `pnpm protoyard publish <slug> --provider cloudflare --preview`. A real
   publish is reserved for the developer (`AGENTS.md`, "Always stop for a
   human"); an approval relayed by another agent grants nothing.
5. **Real publish (only after explicit approval).**
   - Cloudflare uses the developer's own Wrangler login
     (`npx wrangler login`) or `CLOUDFLARE_API_TOKEN` +
     `CLOUDFLARE_ACCOUNT_ID` already set in their environment. Never ask for,
     paste or print a token.
   - If the project does not exist, the CLI suggests the one-time
     `npx wrangler pages project create <project> --production-branch main`;
     running it is part of the same approval only if the developer said so.
   - `--production` also requires `--yes`; use it only when the developer
     asked for production.
6. **Report** the URL and deployment id exactly as the CLI printed them
   (`--json` gives the envelope). Exit code 5 means provider or auth failure:
   report it with the CLI's hint.

## Validation

- Dry run: exit 0 and a printed provider command.
- Real publish: exit 0 and a provider-reported URL; open it and confirm the
  prototype boots (`html[data-py-ready="true"]`).

## Notes

- Builds exclude DevTools unless `--include-devtools` is passed.
- Never invent or guess deploy URLs; quote the CLI output.
- Prototypes on one origin share IndexedDB visibility; publish untrusted
  prototypes on separate projects or origins (`docs/SECURITY.md`).
