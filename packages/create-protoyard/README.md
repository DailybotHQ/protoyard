# create-protoyard

Scaffold a [Protoyard](https://protoyard.app) workspace: functional prototypes
with a persistent in-browser database, deterministic scenarios and simulated
data, and no backend.

```bash
npm create protoyard my-workspace          # or: pnpm create protoyard my-workspace
cd my-workspace && pnpm protoyard dev starter
```

It creates `my-workspace/` (a new or empty folder) with:
- `package.json`, pinning `protoyard` to this package's version;
- the workspace marker and `pnpm-workspace.yaml` (pnpm) or `workspaces` (npm);
- `tsconfig.base.json`, `AGENTS.md`, `README.md` and `.gitignore`;
- a starter prototype in `prototypes/starter`, made by `protoyard new`.

Everything is staged and then renamed into place. A folder with files, a
symlink or your home folder is refused, and nothing is ever overwritten.

| Option | Effect |
| --- | --- |
| `-t, --template <name>` | starter template (default `blank`; `npx protoyard list --kind template`) |
| `--pm pnpm\|npm` | package manager (default: the one running `create`, else pnpm) |
| `--no-install` | skip the install; nothing touches the network |
| `--no-git` | skip `git init` |
| `-y, --yes` | no confirmation prompt |
| `--json` | one JSON envelope (`ok`, `command`, `data` or `error`) |
| `--skill` | show how to install the Protoyard agent skill (nothing is installed) |

Exit codes: 0 created, 1 failed or not empty, 2 usage or unsafe path,
3 unknown template. Everything a Protoyard prototype shows is simulated.
