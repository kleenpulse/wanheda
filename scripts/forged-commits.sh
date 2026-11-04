#!/bin/sh
# Fails on commits that look forged by the 2026-10 worm: it force-pushed tips that
# kept the real author and author time but carried a different committer timezone,
# usually -0800 or -0700. Every commit in the range is checked, merges included.
# There is deliberately no exemption by committer name or email: a forger sets
# those. If an exemption is ever needed, key it on a verified GitHub web-flow
# signature (%G? = G), never on the email (ADR-0011).
#
# Usage:
#   sh scripts/forged-commits.sh <range>       e.g. origin/main..HEAD, or a single rev for its whole history
#   FORBIDDEN_TZ='-0700 -0800' (default)       committer timezones that always fail
#
# Exit codes: 0 clean, 1 suspicious commits found, 2 the check could not run.

set -u

range=${1:-}
if [ -z "$range" ]; then
  echo "usage: sh scripts/forged-commits.sh <range>" >&2
  exit 2
fi

forbidden=${FORBIDDEN_TZ:--0700 -0800}

log=$(git log --format='%H|%ad|%cd|%s' --date=format:'%z' "$range" --) || {
  echo "forged-commits: git log failed for range '$range'" >&2
  exit 2
}

bad=$(printf '%s\n' "$log" | while IFS='|' read -r sha atz ctz subject; do
  [ -z "$sha" ] && continue
  if [ "$atz" != "$ctz" ]; then
    printf '%s author tz %s != committer tz %s  %s\n' "$sha" "$atz" "$ctz" "$subject"
    continue
  fi
  for tz in $forbidden; do
    if [ "$ctz" = "$tz" ]; then
      printf '%s committer tz %s is flagged  %s\n' "$sha" "$ctz" "$subject"
    fi
  done
done)

if [ -n "$bad" ]; then
  printf 'FORGED-COMMITS: suspicious commits in %s\n%s\n' "$range" "$bad"
  echo "forged-commits: FAILED. Do not pull, merge or build these commits until checked." >&2
  exit 1
fi

count=$(printf '%s\n' "$log" | grep -c . || true)
echo "forged-commits: clean ($count commits in $range)"
