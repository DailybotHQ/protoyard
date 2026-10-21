#!/usr/bin/env bash
# Generate a stable SHA256SUMS for the distributable skills/protoyard tree.
set -eu

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd -P)
REPO_DIR=$(cd "$SCRIPT_DIR/.." && pwd -P)
SKILL_DIR="$REPO_DIR/skills/protoyard"
OUTPUT="$REPO_DIR/SHA256SUMS"

usage() {
  cat <<'USAGE'
Usage: scripts/generate-skill-checksums.sh [--dir <skill-dir>] [--output <file>]

Generate a sorted SHA256SUMS for regular files in a distributable skill tree.
The sums file itself and .DS_Store files are excluded.
USAGE
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dir) [ "$#" -ge 2 ] && [ -n "$2" ] || { echo "--dir needs a value" >&2; exit 2; }; SKILL_DIR=$2; shift 2 ;;
    --output) [ "$#" -ge 2 ] && [ -n "$2" ] || { echo "--output needs a value" >&2; exit 2; }; OUTPUT=$2; shift 2 ;;
    -h | --help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

[ -d "$SKILL_DIR" ] || { echo "No skill directory: $SKILL_DIR" >&2; exit 1; }
SKILL_DIR=$(cd "$SKILL_DIR" && pwd -P)
OUTPUT_DIR=$(dirname "$OUTPUT")
[ -d "$OUTPUT_DIR" ] || { echo "No output directory: $OUTPUT_DIR" >&2; exit 1; }
OUTPUT_DIR=$(cd "$OUTPUT_DIR" && pwd -P)
OUTPUT="$OUTPUT_DIR/$(basename "$OUTPUT")"

if command -v shasum >/dev/null 2>&1; then
  HASH_TOOL=shasum
elif command -v sha256sum >/dev/null 2>&1; then
  HASH_TOOL=sha256sum
else
  echo "Neither shasum nor sha256sum is available" >&2
  exit 1
fi

file_list=$(mktemp "${TMPDIR:-/tmp}/protoyard-skill-files.XXXXXX")
sum_file=$(mktemp "$OUTPUT.tmp.XXXXXX")
trap 'rm -f "$file_list" "$sum_file"' EXIT HUP INT TERM

(cd "$SKILL_DIR" && find . -type f ! -name SHA256SUMS ! -name .DS_Store | sed 's|^\./||' | LC_ALL=C sort) >"$file_list"
[ -s "$file_list" ] || { echo "No distributable skill files found" >&2; exit 1; }

while IFS= read -r rel; do
  case "$HASH_TOOL" in
    shasum) digest=$(shasum -a 256 "$SKILL_DIR/$rel" | awk '{print $1}') ;;
    sha256sum) digest=$(sha256sum "$SKILL_DIR/$rel" | awk '{print $1}') ;;
  esac
  printf '%s  %s\n' "$digest" "$rel" >>"$sum_file"
done <"$file_list"

mv "$sum_file" "$OUTPUT"
echo "Wrote $OUTPUT ($(wc -l <"$file_list" | tr -d ' ') files)"
