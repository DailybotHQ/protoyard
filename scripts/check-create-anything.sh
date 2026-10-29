#!/usr/bin/env bash
# `bash scripts/check-create-anything.sh` — prove that Protoyard can create
# anything, end to end, on the Texuli it installs from npm.
#
# In a throwaway git worktree of HEAD (so the checkout is never touched) it:
#   1. scaffolds a prototype from EVERY template (`protoyard new`) and builds it
#      (`protoyard validate --build`);
#   2. generates one prototype per kind from a catalog blueprint (app, deck,
#      page, doc) and builds it;
#   3. turns a prose brief into a blueprint and a generated prototype, and
#      builds it;
#   4. makes a quick exploration of each kind (`protoyard quick --kind`) and
#      exports it as one file.
#
# Prints one line per step and a summary. Exit 0 when every step passes,
# 1 otherwise. Set PROTOYARD_CREATE_KEEP=1 to keep the worktree for debugging.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WT="$(mktemp -d "${TMPDIR:-/tmp}/protoyard-create-anything.XXXXXX")"
LOG="$WT.log"
failed=0
passed=0

cleanup() {
  if [ "${PROTOYARD_CREATE_KEEP:-0}" != "1" ]; then
    git -C "$ROOT" worktree remove --force "$WT" >/dev/null 2>&1 || rm -rf "$WT"
  fi
}
trap cleanup EXIT

step() {
  local label="$1"
  shift
  if "$@" >>"$LOG" 2>&1; then
    passed=$((passed + 1))
    echo "✓ $label"
  else
    failed=$((failed + 1))
    echo "✗ $label (log: $LOG)"
  fi
}

refresh_spec() {
  local slug="$1"
  py spec "$slug" --write
}

git -C "$ROOT" worktree add --detach "$WT" HEAD >>"$LOG" 2>&1 || {
  echo "✗ could not create the worktree (log: $LOG)"
  exit 1
}
cd "$WT" || exit 1
step "install (frozen lockfile)" pnpm install --frozen-lockfile --prefer-offline

py() { pnpm --silent protoyard "$@" </dev/null; }

# 1. Every template.
for dir in templates/*/; do
  template="$(basename "$dir")"
  [ -f "$dir/protoyard.json" ] || [ -f "$dir/package.json" ] || continue
  slug="zz-new-$template"
  step "new --template $template" py new "$slug" --template "$template" --no-install
done
step "install the scaffolded prototypes" pnpm install --prefer-offline
refresh_scaffolded_specs() {
  local dir slug
  for dir in prototypes/zz-new-*/; do
    [ -d "$dir" ] || continue
    slug="$(basename "$dir")"
    refresh_spec "$slug" || return 1
  done
}
step "refresh scaffolded prototype specs" refresh_scaffolded_specs
for dir in templates/*/; do
  template="$(basename "$dir")"
  slug="zz-new-$template"
  [ -d "prototypes/$slug" ] || continue
  step "validate --build $slug" py validate "$slug" --build
done

# 2. One generated prototype per kind.
generate_kind() {
  local slug="$1" blueprint="$2"
  py generate "$slug" --blueprint "$blueprint" && pnpm install --prefer-offline &&
    refresh_spec "$slug" && py validate "$slug" --build
}
step "generate app" generate_kind zz-gen-app "$(ls blueprints/*.json | head -1)"
step "generate deck (everything)" generate_kind zz-gen-deck blueprints/decks/everything.json
step "generate page" generate_kind zz-gen-page "$(ls blueprints/pages/*.json | head -1)"
step "generate doc" generate_kind zz-gen-doc "$(ls blueprints/docs/*.json | head -1)"

# 3. Prose brief → blueprint → generated prototype.
brief() {
  echo "A field-service app where dispatchers assign repair jobs to technicians, track parts and bill customers" |
    pnpm --silent protoyard blueprint new tmp/zz-brief.blueprint.json --from-brief - --generate zz-brief &&
    pnpm install --prefer-offline && refresh_spec zz-brief && py validate zz-brief --build
}
step "brief → blueprint → prototype" brief

# 4. Quick exploration of each kind, exported as one file.
for kind in app deck page doc; do
  quick_kind() {
    py quick "A $kind about a neighborhood bike repair cooperative" --kind "$kind" --slug "zz-quick-$kind" &&
      py quick export "zz-quick-$kind" --single-file
  }
  step "quick --kind $kind + single-file export" quick_kind
done

echo "create-anything: $passed passed, $failed failed"
[ "$failed" -eq 0 ]
