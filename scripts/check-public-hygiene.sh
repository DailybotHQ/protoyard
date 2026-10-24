#!/usr/bin/env bash
# Public-hygiene check: fail when a tracked file carries content that must
# never be published from this public repository.
#
#   bash scripts/check-public-hygiene.sh [--root DIR] [--max-kb N]
#
# Scans every file `git ls-files` lists (regular files; binary files skipped
# for content rules), except vendored skill packs under .agents/skills/ and
# the .claude/ links. Prints `path:line: <rule>` and NEVER prints the matched
# text, so a real secret is not echoed into a CI log.
#
# Rules:
#   env-file        a tracked .env / .env.* / .envrc file (only .env.example is allowed)
#   symlink-escape  a tracked symlink whose target is absolute or leaves the
#                   repository (it would pull an outside file into builds)
#   large-file      a tracked file over --max-kb (default 1024 KB); lockfiles exempt
#   personal-path   absolute home paths (/Users/<name>, /home/<name>), except
#                   the stock CI/container accounts (runner, node, user, ubuntu)
#   private-email   @dailybot.com addresses other than the public aliases
#   secret-*        credential shapes (AWS, GitHub, Anthropic/OpenAI, Slack,
#                   Google, Cloudflare/Netlify/Vercel-style quoted tokens,
#                   private-key headers, long quoted secret assignments,
#                   npm tokens and _authToken lines, JWTs)
#   trojan-source   a literal bidi embedding, override or isolate character
#                   (U+202A-U+202E, U+2066-U+2069) in a text file: source then reads
#                   differently than it runs. Write \u escapes instead. Needs
#                   `git grep -P`; skipped with a warning where git has no PCRE.
#
# A fixture that needs a secret-shaped string lists it in
# .public-hygiene-allow as `<path> <secret-rule> <reason>`; only secret-*
# rules can be allowed and the hit line itself must say fake/test/example.
#
# Exit codes: 0 clean, 1 hits, 2 usage error. Dependencies: bash 3.2+, git, grep.
set -u

ROOT=.
MAX_KB=1024
while [ $# -gt 0 ]; do
  case "$1" in
    --root) [ $# -ge 2 ] || { echo "usage: $0 [--root DIR] [--max-kb N]" >&2; exit 2; }; ROOT=$2; shift 2 ;;
    --max-kb) [ $# -ge 2 ] || { echo "usage: $0 [--root DIR] [--max-kb N]" >&2; exit 2; }; MAX_KB=$2; shift 2 ;;
    -h | --help) sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "usage: $0 [--root DIR] [--max-kb N]" >&2; exit 2 ;;
  esac
done
cd "$ROOT" 2>/dev/null || { echo "check-public-hygiene: no such directory: $ROOT" >&2; exit 2; }
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || {
  echo "check-public-hygiene: $ROOT is not a git work tree" >&2
  exit 2
}

SELF=scripts/check-public-hygiene.sh
ALLOW=.public-hygiene-allow
# A whole package.json dependency value that is a version specifier, not a
# credential: link:/workspace: paths, or a semver range (major.minor at least,
# with optional operators, pre-release and || alternatives).
SEMVER='[~^]?(>=|<=|>|<|=)?v?[0-9]+\.[0-9xX*]+(\.[0-9xX*]+)?([-+][0-9A-Za-z.-]+)?'
DEP_SPEC='^[[:space:]]*"[^"]+"[[:space:]]*:[[:space:]]*"(link:[^"]*|workspace:[^"]*|'"$SEMVER"'([[:space:]]+'"$SEMVER"')*([[:space:]]*\|\|[[:space:]]*'"$SEMVER"')*)"[[:space:]]*,?[[:space:]]*$'
FAKE_MARKER='fake|test|planted|example|dummy'

rules() {
  cat <<'RULES'
personal-path	(^|[^A-Za-z0-9_.~/-])/(Users|home)/[A-Za-z0-9][A-Za-z0-9._-]*	-
private-email	[A-Za-z0-9._%+-]+@dailybot\.com	i
secret-aws	(AKIA|ASIA)[0-9A-Z]{16}	-
secret-github	(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{22,}	-
secret-ai	sk-ant-[A-Za-z0-9_-]{20,}|sk-(proj|svcacct|admin)-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{32,}	-
secret-slack	xox[abposr]-[A-Za-z0-9-]{10,}	-
secret-google	AIza[0-9A-Za-z_-]{35}	-
secret-private-key	-----BEGIN ([A-Z0-9]+ )*PRIVATE KEY-----	-
secret-npm	npm_[A-Za-z0-9]{36}|_authToken[[:space:]]*=[[:space:]]*[^$[:space:]][^[:space:]]{8,}	-
secret-jwt	eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}	-
secret-assignment	(api[_-]?key|secret|token|passw(or)?d|access[_-]?key)[A-Za-z0-9_]*["']?[[:space:]]*[:=][[:space:]]*["'][^"'[:space:]$]{16,}["']	i
secret-env	^[[:space:]]*(export[[:space:]]+)?[A-Z0-9_]*(API_?KEY|SECRET|TOKEN|PASSWORD|PASSWD|ACCESS_KEY)[A-Z0-9_]*=[^"'[:space:]$]{16,}	-
RULES
}

allow_pairs=""
if [ -f "$ALLOW" ]; then
  n=0
  while IFS= read -r line || [ -n "$line" ]; do
    n=$((n + 1))
    case "$line" in '' | '#'*) continue ;; esac
    # shellcheck disable=SC2086
    set -- $line
    if [ $# -lt 3 ]; then echo "$ALLOW:$n: entry needs '<path> <rule> <reason>'" >&2; exit 2; fi
    case "$2" in secret-*) ;; *) echo "$ALLOW:$n: only secret-* rules can be allowed (got '$2')" >&2; exit 2 ;; esac
    allow_pairs="$allow_pairs
$1 $2"
  done <"$ALLOW"
fi
is_allowed() { printf '%s\n' "$allow_pairs" | grep -qxF "$1 $2"; }

files=$(git ls-files | grep -vE '^\.agents/skills/|^\.claude/' | while IFS= read -r f; do
  if [ -f "$f" ] && [ ! -L "$f" ]; then printf '%s\n' "$f"; fi
done)

hits=0
report() { echo "$1:$2: $3${4:+ ($4)}"; hits=$((hits + 1)); }

# File-level rules.
while IFS= read -r f; do
  [ -n "$f" ] || continue
  base=${f##*/}
  case "$base" in
    .env.example | .env.*.example) ;;
    .env | .env.* | .envrc) report "$f" 1 env-file "environment files must never be tracked" ;;
  esac
  case "$base" in pnpm-lock.yaml | package-lock.json | yarn.lock) continue ;; esac
  size_kb=$(( ($(wc -c <"$f") + 1023) / 1024 ))
  if [ "$size_kb" -gt "$MAX_KB" ]; then report "$f" 1 large-file "${size_kb} KB > ${MAX_KB} KB"; fi
done <<EOF_FILES
$files
EOF_FILES

# Tracked symlinks (git mode 120000): the target must stay inside the repo.
repo_root=$(pwd -P)
while IFS= read -r line; do
  [ -n "$line" ] || continue
  path=${line#*	}
  case "$path" in .agents/skills/* | .claude/*) continue ;; esac
  target=$(git cat-file -p "$(printf '%s' "$line" | awk '{print $2}')" 2>/dev/null) || continue
  case "$target" in
    /*) report "$path" 1 symlink-escape "absolute target" ; continue ;;
  esac
  link_dir=$(dirname "$path")
  resolved=$(cd "$link_dir" 2>/dev/null && cd "$(dirname "$target")" 2>/dev/null && pwd -P) || resolved=""
  case "$resolved" in
    "$repo_root" | "$repo_root"/*) ;;
    *)
      # Unresolvable (dangling) or outside: count ".." segments lexically as a fallback.
      depth=$(printf '%s' "$link_dir" | awk -F/ '{print ($0=="."?0:NF)}')
      ups=$(printf '%s' "$target" | awk -F/ '{n=0; for (i=1;i<=NF;i++) if ($i=="..") n++; print n}')
      if [ -z "$resolved" ] && [ "$ups" -le "$depth" ]; then continue; fi
      report "$path" 1 symlink-escape "target leaves the repository"
      ;;
  esac
done <<EOF_LINKS
$(git ls-files -s | awk '$1 == "120000"')
EOF_LINKS

# Content rules (text files only: grep -I skips binaries). Hits print from a
# pipeline subshell, so they are collected as output and counted afterwards.
# (a function, not inline: bash 3.2 mis-parses `case` inside $(...))
scan_content() {
while IFS='	' read -r rule pattern flag; do
  [ -n "$rule" ] || continue
  gflags=-nIE
  [ "$flag" = i ] && gflags=-nIEi
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    [ "$f" = "$SELF" ] && continue
    grep $gflags -- "$pattern" "$f" 2>/dev/null | while IFS= read -r hit; do
      lineno=${hit%%:*}
      text=${hit#*:}
      case "$rule" in
        personal-path)
          printf '%s\n' "$text" | grep -qE '/(Users|home)/(runner|node|user|ubuntu|vscode|dev)([^A-Za-z0-9_-]|$)' && continue
          ;;
        private-email)
          printf '%s\n' "$text" | grep -qiE '(security|support|hello|oss|opensource|ops|noreply)@dailybot\.com' && continue
          ;;
        secret-*)
          # A package.json dependency specifier is never a secret: the whole
          # value is a link:/workspace: path or a semver range, so a key such
          # as "@texuli/tokens" with a long link: value is not a token.
          if [ "$rule" = secret-assignment ] && [ "${f##*/}" = package.json ] &&
            printf '%s\n' "$text" | grep -qE "$DEP_SPEC"; then continue; fi
          if is_allowed "$f" "$rule" && printf '%s\n' "$text" | grep -qiE "$FAKE_MARKER"; then continue; fi
          ;;
      esac
      echo "$f:$lineno: $rule"
    done
  done <<EOF_FILES
$files
EOF_FILES
done <<EOF_RULES
$(rules)
EOF_RULES
}
content_hits=$(scan_content)
if [ -n "$content_hits" ]; then
  printf '%s\n' "$content_hits"
  hits=$((hits + $(printf '%s\n' "$content_hits" | wc -l)))
fi

# Trojan Source (literal bidi controls). git grep -P exits 0/1 when PCRE works
# and 128 when this git was built without it.
git grep -qP -e '\x{41}' -- "$SELF" >/dev/null 2>&1
pcre=$?
if [ "$pcre" -le 1 ]; then
  bidi_hits=$(git grep -nIP -e '[\x{202A}-\x{202E}\x{2066}-\x{2069}]' -- . ':!.agents/skills' ':!.claude' 2>/dev/null |
    awk -F: '{print $1 ":" $2 ": trojan-source"}')
  if [ -n "$bidi_hits" ]; then
    printf '%s\n' "$bidi_hits"
    hits=$((hits + $(printf '%s\n' "$bidi_hits" | wc -l)))
  fi
else
  echo "check-public-hygiene: git grep -P is unavailable; skipped the trojan-source rule." >&2
fi

if [ "$hits" -gt 0 ]; then
  echo "check-public-hygiene: $hits problem(s). Remove them, or allow a fake fixture in $ALLOW." >&2
  exit 1
fi
echo "check-public-hygiene: clean ($(printf '%s\n' "$files" | grep -c .) tracked files)."
