#!/usr/bin/env bash
# Prints one version's section of CHANGELOG.md (without its heading), for
# release notes:  bash scripts/changelog-section.sh 0.1.0 [CHANGELOG.md]
# Exit 1 when the version has no section or the section is empty.
set -eu
version=${1:?usage: changelog-section.sh <version> [file]}
file=${2:-CHANGELOG.md}
section=$(awk -v v="$version" '
  /^## \[/ { if (found) exit; if (index($0, "## [" v "]") == 1) { found = 1; next } }
  /^\[[^]]+\]: / { if (found) exit }
  found { print }
' "$file" | sed -e '/./,$!d')
if [ -z "$(printf '%s' "$section" | tr -d '[:space:]')" ]; then
  echo "changelog-section: no entry for $version in $file" >&2
  exit 1
fi
printf '%s\n' "$section"
