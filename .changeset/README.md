# Changesets

Every public package (`@protoyard/*`, `protoyard`, `create-protoyard`) is
versioned in **lockstep** through one Changesets `fixed` group: a bump to any
of them bumps all of them to the same version (ADR-028). Prototypes and
templates are private and are never versioned or tagged here.

```bash
pnpm changeset                 # describe a change: pick the packages and the bump
pnpm version-packages          # apply pending changesets, then sync the root version
```

`pnpm version-packages` runs `changeset version` and then sets the root
`package.json` version to the lockstep version, which the release workflow
compares with the `v*` tag. It refuses to finish if the public packages do
not share one version.

Changesets writes a `CHANGELOG.md` per package. The root `CHANGELOG.md` stays
hand-curated in Keep a Changelog format: add the release section there before
tagging (`scripts/changelog-section.sh <version>` must find it).
