# Protoyard skill installation reference

This reference contains the host paths and fallback commands used by
`install/SKILL.md`. Every reproducible installation names a release tag.
Replace `vX.Y.Z` below with the exact Protoyard tag selected for the install.

## Install methods

### 1. Skills CLI (recommended)

The skills CLI is the cross-agent route. Run it from the workspace for a
project-scoped installation, or add its documented global flag for a user-wide
installation:

```bash
npx skills add https://github.com/DailybotHQ/protoyard/tree/vX.Y.Z --skill protoyard
npx skills add https://github.com/DailybotHQ/protoyard/tree/vX.Y.Z --skill protoyard -g
```

The first command lets the CLI detect the available host integrations. Use its
agent-selection option when only one host should receive the skill. The second
command installs globally for the selected or detected host. Use the CLI's
non-interactive option only when the selected tag and destination are already
known and approved.

Project-scoped installs should leave a `skills-lock.json` entry. Treat that
lock entry and the version in the installed `SKILL.md` as the evidence of what
the workspace uses.

### 2. OpenClaw native registry

OpenClaw users can use its native registry after the Protoyard skill is listed
there:

```bash
openclaw skills install protoyard
```

The native registry is OpenClaw-specific. Confirm that its selected registry
release corresponds to the desired Protoyard tag. If the registry does not
expose the required tag, use the pinned skills CLI or manual route instead.

### 3. Manual tagged checkout

Use this route when Node or the skills CLI is unavailable, or when the host
needs an explicit filesystem install. Check out the selected tag and copy only
the distributable skill directory into the host's skill directory:

```bash
git clone --branch vX.Y.Z --depth 1 https://github.com/DailybotHQ/protoyard.git /tmp/protoyard-vX.Y.Z
mkdir -p <host-skills-directory>
cp -R /tmp/protoyard-vX.Y.Z/skills/protoyard <host-skills-directory>/protoyard
```

Or run `skills/protoyard/setup.sh --host <host>` from the checkout (see
`--help`) to install through the supported host map.

For a repeatable manual update, remove or replace the old `protoyard`
directory only after the new checkout has been inspected. The manual route
does not create a `skills-lock.json` entry; record the selected tag in the
workspace's normal setup notes when reproducibility matters.

Host-specific manual locations, the supported host set, the OpenClaw native
route, and discovery checks live in the [host installation reference](hosts.md).
The directory must contain the router at `SKILL.md`, the `install/` sub-skill,
and the `references/` directory. Do not flatten the contents into the parent
skills directory.

## Verify the installed version

After copying or installing, restart the host and inspect the installed
frontmatter. From the host's skill directory:

```bash
sed -n '/^version:/p' protoyard/SKILL.md
test -f protoyard/install/SKILL.md
test -f protoyard/references/install.md
```

The printed version must match the selected release tag. For a project-scoped
skills CLI installation, also inspect `skills-lock.json` and confirm its
Protoyard entry points at the same release. Then ask the host to list or route
the `protoyard` skill; this catches stale sessions that have not reloaded their
skill index.

The skill version and the Protoyard CLI version are independent. If CLI
commands are needed, verify the separately installed executable:

```bash
protoyard --version
```

Do not infer that one installation succeeded from the other command's output.

## Update, remove, and rollback

For a skills CLI installation, use the CLI's update or remove command only
after selecting the replacement tag and checking its release notes. For
OpenClaw, use its native update or remove commands after confirming the
registry release. For a manual install, replace the host directory with a
checkout of the desired tag. A rollback is the same operation with the
previous known-good tag.

No route should silently follow a floating branch, execute a downloaded shell
script, or overwrite an existing skill without the developer's consent.
