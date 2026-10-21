#!/usr/bin/env bash
# Smoke-install one tagged Protoyard skill release without touching the runner's home.
#
# Usage: scripts/smoke-install-skill.sh v1.2.3
#
# The skills CLI is intentionally invoked against the exact GitHub tree URL. This
# is a release check, not a local-pack or npm-publishing shortcut.
set -eu

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 vX.Y.Z" >&2
  exit 2
fi

TAG=$1
case "$TAG" in
  v[0-9]*.[0-9]*.[0-9]*) ;;
  *) echo "smoke-install-skill: expected a version tag such as v1.2.3 (got $TAG)" >&2; exit 2 ;;
esac

command -v npx >/dev/null 2>&1 || {
  echo "smoke-install-skill: npx is required" >&2
  exit 1
}

VERSION=${TAG#v}
SOURCE="https://github.com/DailybotHQ/protoyard/tree/$TAG"
SMOKE_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/protoyard-skill-smoke.XXXXXX")
SMOKE_HOME="$SMOKE_ROOT/home"
mkdir -p "$SMOKE_HOME"
cleanup() {
  rm -rf "$SMOKE_ROOT"
}
trap cleanup EXIT HUP INT TERM

# The skills CLI uses HOME/.agents/skills for its global canonical copy. Set
# CODEX_HOME as well so an inherited runner setting cannot escape this fixture.
export HOME="$SMOKE_HOME"
export CODEX_HOME="$SMOKE_HOME/.codex"
export DISABLE_TELEMETRY=1

echo "Smoke-installing Protoyard skill from $SOURCE"
(cd "$SMOKE_ROOT" && npx --yes skills add "$SOURCE" --skill protoyard --global --agent codex --copy --yes)

INSTALLED="$SMOKE_HOME/.agents/skills/protoyard"
ROUTER="$INSTALLED/SKILL.md"
[ -f "$ROUTER" ] || {
  echo "smoke-install-skill: installed router is missing at $ROUTER" >&2
  exit 1
}
[ ! -L "$INSTALLED" ] || {
  echo "smoke-install-skill: expected a copied skill, found a symlink at $INSTALLED" >&2
  exit 1
}

ROUTER_VERSION=$(sed -n 's/^version:[[:space:]]*"\([^"]*\)"[[:space:]]*$/\1/p' "$ROUTER" | head -n 1)
[ "$ROUTER_VERSION" = "$VERSION" ] || {
  echo "smoke-install-skill: router version is ${ROUTER_VERSION:-missing}, expected $VERSION" >&2
  exit 1
}

EXPECTED="TRUST.md install/SKILL.md quick/SKILL.md new/SKILL.md iterate/SKILL.md kits/SKILL.md review/SKILL.md ship/SKILL.md upgrade/SKILL.md references/install.md references/hosts.md"
for relative in $EXPECTED; do
  [ -f "$INSTALLED/$relative" ] || {
    echo "smoke-install-skill: expected file is missing: $relative" >&2
    exit 1
  }
done

echo "Smoke install passed: Protoyard skill $VERSION and expected sub-skills are present in an isolated home."
