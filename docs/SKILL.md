# Protoyard skill

Protoyard's distributable agent skill lives in `skills/protoyard/` in the
repository.
Its router directs prototype work to focused local sub-skills for quick
exploration, full prototype creation, iteration, reusable kits, review, export
and publishing, installation, and upgrades. The sub-skills and their references
ship with the pack so an agent can follow them without fetching instructions at
runtime.

## Install a tagged release

Install the `protoyard` skill from a versioned repository tree with the skills
CLI:

```bash
npx skills add https://github.com/DailybotHQ/protoyard/tree/vX.Y.Z --skill protoyard
```

Replace `vX.Y.Z` with the desired Protoyard release tag. The pinned URL keeps
the skill aligned with that release's CLI. The router is the `protoyard`
entrypoint; the `install` sub-skill contains host-specific installation and
verification steps.

The agent skill and the Protoyard CLI are separate installs. Check `protoyard
--help` and `protoyard --version` before following CLI examples; available
commands depend on the CLI release. See the [Protoyard documentation](https://protoyard.app/docs/)
for product guides and the release-specific skill instructions for trust,
integrity, and upgrade details.
