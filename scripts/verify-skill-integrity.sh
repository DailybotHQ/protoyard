#!/usr/bin/env bash
# Verify a release checkout's distributable skill against SHA256SUMS.
set -eu

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd -P)
REPO_DIR=$(cd "$SCRIPT_DIR/.." && pwd -P)
SKILL_DIR="$REPO_DIR/skills/protoyard"
SUMS_FILE="$REPO_DIR/SHA256SUMS"

usage() {
  cat <<'USAGE'
Usage: scripts/verify-skill-integrity.sh [--dir <skill-dir>] [--sums <file>]

Verify every listed skill file and reject missing, changed, or unlisted files.
USAGE
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dir) [ "$#" -ge 2 ] && [ -n "$2" ] || { echo "--dir needs a value" >&2; exit 2; }; SKILL_DIR=$2; shift 2 ;;
    --sums) [ "$#" -ge 2 ] && [ -n "$2" ] || { echo "--sums needs a value" >&2; exit 2; }; SUMS_FILE=$2; shift 2 ;;
    -h | --help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

exec "$REPO_DIR/skills/protoyard/setup.sh" --verify --dir "$SKILL_DIR" --sums "$SUMS_FILE"
