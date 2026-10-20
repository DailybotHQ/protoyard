---
name: protoyard-ship
description: Export a verified Protoyard prototype and prepare a provider deployment while keeping every live upload or package release behind explicit developer approval.
version: "1.0.0"
documentation_url: https://protoyard.app/docs/
user-invocable: true
metadata:
  openclaw:
    emoji: "🚀"
    homepage: https://protoyard.app/docs/
    requires:
      anyBins:
        - git
allowed-tools: Bash, Read, Grep, Glob
---

# Ship a Protoyard prototype

Use this sub-skill when the developer asks to export, share, or publish a
prototype. Read the [publishing guide](../../../docs/PUBLISHING.md) for the
current CLI contract and provider details. The CLI is local-first, but a
provider publish without `--dry-run` uploads immediately; the agent must keep
that action behind an explicit approval checkpoint.

## 1. Verify the build

First inspect the installed CLI instead of assuming a command or option is
available:

```bash
pnpm protoyard --version
pnpm protoyard export --help
pnpm protoyard publish --help
```

For `<slug>`, run the local verification that matches what will be shipped:

```bash
pnpm protoyard validate <slug> --build
pnpm protoyard build <slug>
pnpm protoyard budget <slug> --skip-build
```

`validate --build` checks the prototype and produces the production build.
`build` writes `artifacts/<slug>/dist` and its `build-manifest.json`; the
manifest records the output files and hashes. `export` and `publish` also run
the cross-prototype isolation check. Fix a failed check before preparing a
ship; do not skip type checking or isolation.

## 2. Export a relocatable artifact

The normal export is a ZIP containing the contents of `dist/`, with no wrapper
folder:

```bash
pnpm protoyard export <slug>
```

The default `base: "./"` makes the result relocatable. Unzip it into a static
host and upload the contents, not the ZIP. Serve it over HTTP; opening
`index.html` with `file://` blocks JavaScript modules. If the prototype uses a
custom absolute base, serve it at that exact path.

For a Claude artifact, check the complete pack without writing it first:

```bash
pnpm protoyard export <slug> --target artifact --dry-run
```

Only after the dry run is reviewed, create the pack with
`pnpm protoyard export <slug> --target artifact`. Sharing the returned private
artifact URL is a separate, developer-authorized action; never put a private
URL in tracked files.

## 3. Prepare a provider deployment

Run a provider dry run before any live deployment. It builds, verifies, and
prints the exact provider command without contacting the provider:

```bash
pnpm protoyard publish <slug> --provider <provider> --dry-run
```

Use one of the providers listed by `pnpm protoyard publish --help` and in the
[provider adapter table](../../../docs/PUBLISHING.md#publish-adapters):

- `cloudflare`: [Wrangler](https://developers.cloudflare.com/workers/wrangler/)
  and [Pages direct upload](https://developers.cloudflare.com/pages/how-to/use-direct-upload/).
- `netlify`: experimental; see the [Netlify CLI guide](https://docs.netlify.com/cli/get-started/).
- `vercel`: experimental; see the [Vercel CLI documentation](https://vercel.com/docs/cli).
- `static`: creates a ZIP and upload instructions; it does not contact a host.

Review the dry-run output for the provider, project/site, branch or
production target, exact local `dist` path, and any experimental warning.
`--ensure-project`, `--comments`, and a production target may add provider
side effects or setup requirements; keep them in the review summary.

## 4. Explicit approval before live publish

Do not run a live provider command merely because its dry run succeeded. Show
the developer the exact command and ask for approval that names the provider,
project, target (preview or production), and prototype(s). Only after that
approval run the command without `--dry-run`:

```bash
pnpm protoyard publish <slug> --provider <provider>
```

Preview publishing is still a live upload: the CLI does not prompt for it.
Production additionally requires the CLI's `--yes` (or documented CI) guard:

```bash
pnpm protoyard publish <slug> --provider <provider> --production --yes
```

Never request, print, or store provider tokens. If a provider CLI is missing,
report the install requirement from the publishing guide; do not install it or
log in as a side effect. A dry run is the default preparation path.

## 5. npm releases are a separate consent checkpoint

This sub-skill can inspect a package, tarball, or release workflow when the
developer asks, but it must never run `npm publish`, trigger a release
workflow, or make a package public without explicit approval for that exact
release. Keep package publication separate from prototype export and provider
deployment. Follow the repository's package release instructions and the
[npm publish documentation](https://docs.npmjs.com/cli/v11/commands/npm-publish)
for registry behavior; do not ask for or expose registry credentials.

