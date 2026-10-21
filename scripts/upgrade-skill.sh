#!/usr/bin/env bash
# Consent-gated upgrade check for an installed Protoyard skill.
#
#   scripts/upgrade-skill.sh --host <host> --from <checkout> [--tag vX.Y.Z]
#                            [--home <dir>] [--sums <file>] [--allow-downgrade] [--yes]
#
# <checkout> is a local checkout of the release you selected (for example
# `git clone --branch vX.Y.Z --depth 1 https://github.com/DailybotHQ/protoyard.git`);
# this script never fetches anything and never picks "latest" by itself.
#
# Without --yes it only reports, and changes nothing:
#   1. the installed version (<home>/<host skills dir>/protoyard/SKILL.md) and
#      the selected version (<checkout>/skills/protoyard/SKILL.md), and whether
#      this is an upgrade, the same version or a downgrade;
#   2. with --tag, that the selected skill really is that version;
#   3. the selected skill verified against its release SHA256SUMS
#      (<checkout>/SHA256SUMS, or --sums), through its own setup.sh --verify;
#   4. installed files that differ from the selected release (local edits a
#      replacement would discard; they stay in the backup);
#   5. the exact replacement command.
# --yes, typed by the person after reading that report, runs the replacement:
# the selected release's setup.sh --replace, which moves the current copy to
# <home>/.protoyard/skill-backups/ and touches nothing else in the home (host
# settings and other skills are preserved), then verifies the result. CI=1 or
# any other environment variable never counts as consent.
#
# Exit codes: 0 reported or upgraded, 1 failed (verification, version
# mismatch), 2 usage, 3 refused (downgrade, nothing installed to upgrade).
# Bash 3.2-safe (macOS default).
set -eu

usage() {
  cat <<'USAGE'
Usage:
  scripts/upgrade-skill.sh --host <host> --from <checkout> [--tag vX.Y.Z]
                           [--home <dir>] [--sums <file>] [--allow-downgrade] [--yes]

Compares the installed Protoyard skill with a selected release checkout,
verifies the release checksums and prints the exact replacement command.
Nothing is replaced unless you pass --yes after reading the report.

Options:
  --host <host>       the host the skill is installed for (see setup.sh --list-hosts)
  --from <checkout>   a local checkout of the selected release tag
  --tag <vX.Y.Z>      the tag you selected; the checkout's skill version must match
  --home <dir>        the home directory the skill is installed under (default: $HOME)
  --sums <file>       the release SHA256SUMS (default: <checkout>/SHA256SUMS)
  --allow-downgrade   permit replacing a newer installed version with an older one
  --yes               your explicit confirmation: run the replacement shown
  -h, --help          show this help

Exit codes: 0 reported or upgraded, 1 failed, 2 usage, 3 refused.
USAGE
}

die_usage() {
  echo "upgrade-skill.sh: $1" >&2
  echo "Run scripts/upgrade-skill.sh --help for usage." >&2
  exit 2
}

skill_version() {
  sed -n 's/^version:[[:space:]]*"\{0,1\}\([^"]*\)"\{0,1\}[[:space:]]*$/\1/p' "$1" 2>/dev/null | head -n 1
}

# Prints -1, 0 or 1 comparing two X.Y.Z[-pre] versions (a pre-release sorts first).
compare_versions() {
  awk -v a="$1" -v b="$2" 'function core(v,  p) { p = index(v, "-"); return p ? substr(v, 1, p - 1) : v }
    function pre(v,  p) { p = index(v, "-"); return p ? substr(v, p + 1) : "" }
    BEGIN {
      n = split(core(a), x, "."); m = split(core(b), y, ".")
      for (i = 1; i <= 3; i++) {
        if ((x[i] + 0) < (y[i] + 0)) { print -1; exit }
        if ((x[i] + 0) > (y[i] + 0)) { print 1; exit }
      }
      pa = pre(a); pb = pre(b)
      if (pa == pb) { print 0; exit }
      if (pa == "") { print 1; exit }
      if (pb == "") { print -1; exit }
      print (pa < pb) ? -1 : 1
    }'
}

HOST=""
FROM=""
TAG=""
HOME_DIR=${HOME:-}
SUMS=""
ALLOW_DOWNGRADE=0
YES=0
while [ $# -gt 0 ]; do
  case "$1" in
    --host) [ $# -ge 2 ] && [ -n "$2" ] || die_usage "--host needs a value"; HOST=$2; shift 2 ;;
    --from) [ $# -ge 2 ] && [ -n "$2" ] || die_usage "--from needs a directory"; FROM=$2; shift 2 ;;
    --tag) [ $# -ge 2 ] && [ -n "$2" ] || die_usage "--tag needs a value"; TAG=$2; shift 2 ;;
    --home) [ $# -ge 2 ] && [ -n "$2" ] || die_usage "--home needs a directory"; HOME_DIR=$2; shift 2 ;;
    --sums) [ $# -ge 2 ] && [ -n "$2" ] || die_usage "--sums needs a file"; SUMS=$2; shift 2 ;;
    --allow-downgrade) ALLOW_DOWNGRADE=1; shift ;;
    --yes) YES=1; shift ;;
    -h | --help) usage; exit 0 ;;
    *) die_usage "unknown option: $1" ;;
  esac
done

[ -n "$HOST" ] || die_usage "--host is required"
[ -n "$FROM" ] || die_usage "--from <checkout of the selected tag> is required"
[ -d "$FROM" ] || die_usage "no checkout at $FROM"
FROM=$(cd "$FROM" && pwd -P)
CANDIDATE="$FROM/skills/protoyard"
SETUP="$CANDIDATE/setup.sh"
[ -f "$CANDIDATE/SKILL.md" ] && [ -f "$SETUP" ] || die_usage "$FROM has no skills/protoyard/ (with SKILL.md and setup.sh)"
[ -n "$HOME_DIR" ] || die_usage "no home directory: set HOME or pass --home"
[ -d "$HOME_DIR" ] || die_usage "home directory does not exist: $HOME_DIR"
HOME_DIR=$(cd "$HOME_DIR" && pwd -P)
[ -n "$SUMS" ] || SUMS="$FROM/SHA256SUMS"
if [ -n "$TAG" ]; then
  case "$TAG" in
    v[0-9]*.[0-9]*.[0-9]*) ;;
    *) die_usage "--tag must be a release tag like v1.2.3 (got $TAG)" ;;
  esac
fi

# The destination comes from the selected release's own host map.
REL=$(bash "$SETUP" --list-hosts | awk -v h="$HOST" '$1 == h { print $2 }')
[ -n "$REL" ] || die_usage "unknown host: $HOST (see: bash $SETUP --list-hosts)"
REL=${REL#\~/}
INSTALLED="$HOME_DIR/${REL%/}"

SELECTED_VERSION=$(skill_version "$CANDIDATE/SKILL.md")
[ -n "$SELECTED_VERSION" ] || { echo "FAILED: the selected skill has no version." >&2; exit 1; }
echo "Protoyard skill upgrade check ($HOST)"
echo "  installed: $INSTALLED"
if [ -f "$INSTALLED/SKILL.md" ] && grep -q '^name:[[:space:]]*protoyard[[:space:]]*$' "$INSTALLED/SKILL.md"; then
  INSTALLED_VERSION=$(skill_version "$INSTALLED/SKILL.md")
  echo "  installed version: ${INSTALLED_VERSION:-unknown}"
else
  echo "Refused: no Protoyard skill is installed at $INSTALLED." >&2
  echo "Install it instead: bash $SETUP --host $HOST" >&2
  exit 3
fi
echo "  selected version:  $SELECTED_VERSION (from $FROM)"

# 2. The selected checkout is the tag that was chosen.
if [ -n "$TAG" ] && [ "${TAG#v}" != "$SELECTED_VERSION" ]; then
  echo "FAILED: $FROM holds version $SELECTED_VERSION, not $TAG. Check out the selected tag." >&2
  exit 1
fi

# 3. The selected release matches its published checksums.
if ! verify_output=$(bash "$SETUP" --verify --dir "$CANDIDATE" --sums "$SUMS" 2>&1); then
  printf '%s\n' "$verify_output" | sed 's/^/  /' >&2
  echo "FAILED: the selected skill does not match its release SHA256SUMS; nothing was changed." >&2
  exit 1
fi
echo "  release checksums: ok ($SUMS)"

# 1. Upgrade, same, or downgrade.
relation=$(compare_versions "${INSTALLED_VERSION:-0.0.0}" "$SELECTED_VERSION")
case "$relation" in
  0)
    echo "Already current: the installed skill is $SELECTED_VERSION. Nothing to do."
    exit 0
    ;;
  1)
    if [ "$ALLOW_DOWNGRADE" -ne 1 ]; then
      echo "Refused: $SELECTED_VERSION is older than the installed $INSTALLED_VERSION." >&2
      echo "Pass --allow-downgrade if the developer chose to go back to it." >&2
      exit 3
    fi
    echo "  change: downgrade ${INSTALLED_VERSION} → $SELECTED_VERSION (allowed)"
    ;;
  *) echo "  change: upgrade ${INSTALLED_VERSION:-unknown} → $SELECTED_VERSION" ;;
esac

# 4. Installed files that the replacement would change (kept in the backup).
changes=$(diff -rq "$INSTALLED" "$CANDIDATE" 2>/dev/null | grep -v '\.DS_Store' || true)
if [ -n "$changes" ]; then
  echo "  files that differ from the selected release (the current copy is kept as a backup):"
  printf '%s\n' "$changes" | sed "s|$INSTALLED/||g; s|$CANDIDATE/||g; s/^/    /"
fi

# 5. The exact replacement, run only with --yes.
COMMAND="bash $SETUP --host $HOST --home $HOME_DIR --replace"
echo "  replacement command:"
echo "    $COMMAND"
echo "  it replaces only $INSTALLED; the current copy moves to"
echo "  $HOME_DIR/.protoyard/skill-backups/, and host settings and other skills are not touched."

if [ "$YES" -ne 1 ]; then
  echo "Nothing was changed. After the developer confirms this upgrade, rerun with --yes."
  exit 0
fi

echo "Confirmed with --yes: replacing."
bash "$SETUP" --host "$HOST" --home "$HOME_DIR" --replace
now=$(skill_version "$INSTALLED/SKILL.md")
if [ "$now" != "$SELECTED_VERSION" ]; then
  echo "FAILED: the installed version is ${now:-unknown}, expected $SELECTED_VERSION." >&2
  echo "Restore the backup from $HOME_DIR/.protoyard/skill-backups/." >&2
  exit 1
fi
if ! bash "$SETUP" --verify --dir "$INSTALLED" --sums "$SUMS" >/dev/null 2>&1; then
  echo "FAILED: the installed copy does not match the release SHA256SUMS." >&2
  echo "Restore the backup from $HOME_DIR/.protoyard/skill-backups/." >&2
  exit 1
fi
echo "Upgraded: the installed skill is now $SELECTED_VERSION and matches the release checksums."
echo "Restart or reload the host so it reads the new version."
