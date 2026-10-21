#!/usr/bin/env bash
# Protoyard skill setup: install this skill pack into one agent host's
# user-level skill directory, or verify the pack's integrity.
#
#   ./setup.sh --host <host> [--home <dir>] [--link] [--replace] [--dry-run]
#   ./setup.sh --verify [--sums <file>] [--dir <skill-dir>]
#   ./setup.sh --list-hosts
#   ./setup.sh --help
#
# Hosts and destinations (references/hosts.md is the canonical map):
#   claude    ~/.claude/skills/protoyard/
#   cursor    ~/.cursor/skills/protoyard/
#   codex     ~/.codex/skills/protoyard/
#   gemini    ~/.gemini/skills/protoyard/
#   copilot   ~/.copilot/skills/protoyard/
#   opencode  ~/.config/opencode/skills/protoyard/
#   windsurf  ~/.codeium/windsurf/skills/protoyard/
#
# Install behavior (predictable, never silent):
#   - nothing there              → copy the pack (or symlink it with --link)
#   - the same pack already there → no change
#   - another Protoyard version   → refused unless --replace; the old copy is
#     moved to <home>/.protoyard/skill-backups/<host>-<UTC stamp>/protoyard
#   - anything else (an unrelated skill, a file) → always refused
# The copy is staged next to the destination and moved into place, so a
# failed install leaves the previous state. Only --host's destination and
# the backup folder are written; nothing else in the home is touched.
#
# --verify checks the pack (or --dir) has its required files, then checks
# every file against a SHA256SUMS (the pack's own, or --sums) from the
# matching GitHub Release: a changed, missing or unlisted file fails.
#
# Exit codes: 0 done, 1 failed (verification or install error), 2 usage,
# 3 refused (existing destination). Bash 3.2-safe (macOS default): no
# arrays, associative arrays, mapfile/readarray or case-conversion expansions.
set -eu

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd -P)
PACK_NAME=protoyard
HOSTS="claude cursor codex gemini copilot opencode windsurf"
REQUIRED="SKILL.md TRUST.md install/SKILL.md references/install.md references/hosts.md"

usage() {
  cat <<'USAGE'
Usage:
  ./setup.sh --host <host> [--home <dir>] [--link] [--replace] [--dry-run]
  ./setup.sh --verify [--sums <file>] [--dir <skill-dir>]
  ./setup.sh --list-hosts
  ./setup.sh --help

Installs the Protoyard skill into one host's user-level skill directory:
  claude    ~/.claude/skills/protoyard/
  cursor    ~/.cursor/skills/protoyard/
  codex     ~/.codex/skills/protoyard/
  gemini    ~/.gemini/skills/protoyard/
  copilot   ~/.copilot/skills/protoyard/
  opencode  ~/.config/opencode/skills/protoyard/
  windsurf  ~/.codeium/windsurf/skills/protoyard/
OpenClaw uses its native registry instead: openclaw skills install protoyard

Options:
  --host <host>   the host to install into (required to install)
  --home <dir>    the home directory to install under (default: $HOME)
  --link          symlink this checkout instead of copying it (development)
  --replace       replace another installed Protoyard version (kept as a backup)
  --dry-run       print what would happen and change nothing
  --verify        check the required files and every SHA256SUMS entry, then exit
  --sums <file>   the SHA256SUMS to verify against (default: <skill-dir>/SHA256SUMS)
  --dir <dir>     the skill directory to verify (default: this pack)
  --list-hosts    print each supported host and its destination
  -h, --help      show this help

Exit codes: 0 done, 1 failed, 2 usage, 3 refused (existing destination).
USAGE
}

die_usage() {
  echo "setup.sh: $1" >&2
  echo "Run ./setup.sh --help for usage." >&2
  exit 2
}

# The skills directory for a host, relative to the home; empty when unknown.
host_dir() {
  case "$1" in
    claude) echo ".claude/skills" ;;
    cursor) echo ".cursor/skills" ;;
    codex) echo ".codex/skills" ;;
    gemini) echo ".gemini/skills" ;;
    copilot) echo ".copilot/skills" ;;
    opencode) echo ".config/opencode/skills" ;;
    windsurf) echo ".codeium/windsurf/skills" ;;
    *) echo "" ;;
  esac
}

# The quoted version in a SKILL.md frontmatter ("" when absent).
skill_version() {
  sed -n 's/^version:[[:space:]]*"\{0,1\}\([^"]*\)"\{0,1\}[[:space:]]*$/\1/p' "$1" 2>/dev/null | head -n 1
}

# True when a SKILL.md declares `name: protoyard` (the router of this pack).
is_protoyard_skill() {
  [ -f "$1/SKILL.md" ] && grep -q '^name:[[:space:]]*protoyard[[:space:]]*$' "$1/SKILL.md"
}

sha256_of() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    echo "setup.sh: neither shasum nor sha256sum is available" >&2
    return 1
  fi
}

check_required() {
  missing=0
  for rel in $REQUIRED; do
    if [ ! -f "$1/$rel" ]; then
      echo "  missing: $rel" >&2
      missing=1
    fi
  done
  return "$missing"
}

verify() {
  dir=$1
  sums=$2
  [ -d "$dir" ] || { echo "setup.sh: no skill directory at $dir" >&2; exit 1; }
  echo "Verifying $dir"
  if ! check_required "$dir"; then
    echo "FAILED: required files are missing." >&2
    exit 1
  fi
  echo "  required files: ok (version $(skill_version "$dir/SKILL.md"))"
  [ -n "$sums" ] || sums="$dir/SHA256SUMS"
  if [ ! -f "$sums" ]; then
    echo "FAILED: no SHA256SUMS at $sums." >&2
    echo "Download SHA256SUMS from the matching GitHub Release and pass --sums <file>." >&2
    exit 1
  fi
  sums_abs=$(cd "$(dirname "$sums")" && pwd -P)/$(basename "$sums")
  failed=0
  listed=$(mktemp "${TMPDIR:-/tmp}/protoyard-sums.XXXXXX")
  # shellcheck disable=SC2064
  trap "rm -f '$listed'" EXIT
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in '' | '#'*) continue ;; esac
    hash=$(printf '%s\n' "$line" | awk '{print $1}')
    rel=$(printf '%s\n' "$line" | sed 's/^[0-9a-fA-F]*[[:space:]]*\*\{0,1\}//')
    case "$rel" in
      /* | ../* | */../* | *'/..' | '..')
        echo "  unsafe path in SHA256SUMS: $rel" >&2
        failed=1
        continue
        ;;
    esac
    case "$hash" in
      *[!0-9a-fA-F]* | '') echo "  malformed SHA256SUMS line: $rel" >&2; failed=1; continue ;;
    esac
    printf '%s\n' "$rel" >>"$listed"
    if [ ! -f "$dir/$rel" ]; then
      echo "  missing: $rel" >&2
      failed=1
    elif [ "$(sha256_of "$dir/$rel")" != "$(printf '%s' "$hash" | tr 'A-F' 'a-f')" ]; then
      echo "  changed: $rel" >&2
      failed=1
    fi
  done <"$sums_abs"
  # Files the release did not list (the sums file itself is exempt).
  sums_rel=""
  case "$sums_abs" in "$dir"/*) sums_rel=${sums_abs#"$dir"/} ;; esac
  extra=$(cd "$dir" && find . -type f ! -name '.DS_Store' | sed 's|^\./||' | sort |
    while IFS= read -r rel; do
      [ "$rel" = "$sums_rel" ] && continue
      grep -qxF "$rel" "$listed" || echo "$rel"
    done)
  if [ -n "$extra" ]; then
    printf '%s\n' "$extra" | sed 's/^/  unlisted: /' >&2
    failed=1
  fi
  if [ "$failed" -ne 0 ]; then
    echo "FAILED: the skill does not match $sums." >&2
    exit 1
  fi
  echo "  checksums: ok ($(grep -c . "$listed") files)"
  echo "Verified."
  exit 0
}

# ─── Parse flags ────────────────────────────────────────────────
HOST=""
HOME_DIR=${HOME:-}
LINK=0
REPLACE=0
DRY_RUN=0
VERIFY=0
SUMS=""
VERIFY_DIR=""
LIST=0
while [ $# -gt 0 ]; do
  case "$1" in
    --host) [ $# -ge 2 ] && [ -n "$2" ] || die_usage "--host needs a value"; HOST=$2; shift 2 ;;
    --host=*) HOST=${1#--host=}; shift ;;
    --home) [ $# -ge 2 ] && [ -n "$2" ] || die_usage "--home needs a directory"; HOME_DIR=$2; shift 2 ;;
    --home=*) HOME_DIR=${1#--home=}; shift ;;
    --link) LINK=1; shift ;;
    --replace) REPLACE=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --verify) VERIFY=1; shift ;;
    --sums) [ $# -ge 2 ] && [ -n "$2" ] || die_usage "--sums needs a file"; SUMS=$2; shift 2 ;;
    --dir) [ $# -ge 2 ] && [ -n "$2" ] || die_usage "--dir needs a directory"; VERIFY_DIR=$2; shift 2 ;;
    --list-hosts) LIST=1; shift ;;
    -h | --help) usage; exit 0 ;;
    *) die_usage "unknown option: $1" ;;
  esac
done

if [ "$LIST" -eq 1 ]; then
  for h in $HOSTS; do printf '%-9s ~/%s/%s/\n' "$h" "$(host_dir "$h")" "$PACK_NAME"; done
  exit 0
fi

if [ "$VERIFY" -eq 1 ]; then
  if [ -n "$VERIFY_DIR" ]; then
    [ -d "$VERIFY_DIR" ] || { echo "setup.sh: no skill directory at $VERIFY_DIR" >&2; exit 1; }
    VERIFY_DIR=$(cd "$VERIFY_DIR" && pwd -P)
  else
    VERIFY_DIR=$SCRIPT_DIR
  fi
  verify "$VERIFY_DIR" "$SUMS"
fi

# ─── Install ────────────────────────────────────────────────────
[ -n "$HOST" ] || die_usage "--host is required (one of: $HOSTS)"
if [ "$HOST" = "openclaw" ]; then
  echo "setup.sh: OpenClaw installs through its native registry:" >&2
  echo "  openclaw skills install protoyard" >&2
  exit 2
fi
REL_DIR=$(host_dir "$HOST")
[ -n "$REL_DIR" ] || die_usage "unknown host: $HOST (one of: $HOSTS)"
[ -n "$HOME_DIR" ] || die_usage "no home directory: set HOME or pass --home"
[ -d "$HOME_DIR" ] || { echo "setup.sh: home directory does not exist: $HOME_DIR" >&2; exit 1; }
HOME_DIR=$(cd "$HOME_DIR" && pwd -P)

check_required "$SCRIPT_DIR" || { echo "setup.sh: this pack is incomplete; refusing to install it." >&2; exit 1; }

SKILLS_DIR="$HOME_DIR/$REL_DIR"
TARGET="$SKILLS_DIR/$PACK_NAME"
VERSION=$(skill_version "$SCRIPT_DIR/SKILL.md")
MODE="copy"
[ "$LINK" -eq 1 ] && MODE="link"

echo "Protoyard skill $VERSION → $HOST ($MODE)"
echo "  destination: $TARGET"

# Decide what to do with the destination.
ACTION=install
if [ -L "$TARGET" ]; then
  link_to=$(cd "$TARGET" 2>/dev/null && pwd -P || echo "")
  if [ "$MODE" = link ] && [ "$link_to" = "$SCRIPT_DIR" ]; then
    ACTION=none
  elif [ -n "$link_to" ] && is_protoyard_skill "$TARGET"; then
    ACTION=replace
  else
    echo "Refused: $TARGET is a symlink to something that is not this Protoyard skill." >&2
    exit 3
  fi
elif [ -e "$TARGET" ]; then
  if [ ! -d "$TARGET" ] || ! is_protoyard_skill "$TARGET"; then
    echo "Refused: $TARGET exists and is not a Protoyard skill; it is left untouched." >&2
    echo "Move it away yourself if you want Protoyard there." >&2
    exit 3
  fi
  if [ "$MODE" = copy ] && diff -r "$SCRIPT_DIR" "$TARGET" >/dev/null 2>&1; then
    ACTION=none
  else
    ACTION=replace
  fi
fi

if [ "$ACTION" = none ]; then
  echo "Already installed: no change."
  exit 0
fi

BACKUP=""
if [ "$ACTION" = replace ]; then
  installed=$(skill_version "$TARGET/SKILL.md")
  if [ "$REPLACE" -ne 1 ]; then
    echo "Refused: Protoyard skill ${installed:-of unknown version} is already installed at $TARGET." >&2
    echo "Rerun with --replace to replace it (the current copy is kept as a backup)." >&2
    exit 3
  fi
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  BACKUP="$HOME_DIR/.protoyard/skill-backups/$HOST-$stamp/$PACK_NAME"
  echo "  replacing: ${installed:-unknown version} (backup: $BACKUP)"
fi

if [ "$DRY_RUN" -eq 1 ]; then
  echo "Dry run: nothing changed."
  exit 0
fi

mkdir -p "$SKILLS_DIR"
STAGE=$(mktemp -d "$SKILLS_DIR/.$PACK_NAME.staging.XXXXXX")
# shellcheck disable=SC2064
trap "rm -rf '$STAGE'" EXIT
if [ "$MODE" = link ]; then
  ln -s "$SCRIPT_DIR" "$STAGE/$PACK_NAME"
else
  # Copy regular files and folders only; symlinks inside the pack are not followed.
  (cd "$SCRIPT_DIR" && find . -type d ! -name '.' | while IFS= read -r d; do mkdir -p "$STAGE/$PACK_NAME/$d"; done)
  mkdir -p "$STAGE/$PACK_NAME"
  (cd "$SCRIPT_DIR" && find . -type f ! -name '.DS_Store' | while IFS= read -r f; do cp -p "$f" "$STAGE/$PACK_NAME/$f"; done)
  check_required "$STAGE/$PACK_NAME" || { echo "setup.sh: the staged copy is incomplete." >&2; exit 1; }
fi

if [ -n "$BACKUP" ]; then
  mkdir -p "$(dirname "$BACKUP")"
  mv "$TARGET" "$BACKUP"
fi
if ! mv "$STAGE/$PACK_NAME" "$TARGET"; then
  echo "setup.sh: could not move the skill into place." >&2
  [ -n "$BACKUP" ] && mv "$BACKUP" "$TARGET" && echo "Restored the previous copy." >&2
  exit 1
fi

echo "Installed Protoyard skill $VERSION at $TARGET"
[ -n "$BACKUP" ] && echo "Previous copy kept at $BACKUP"
echo "Restart or reload $HOST so it discovers the skill. The Protoyard CLI is a separate install."
exit 0
