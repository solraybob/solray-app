#!/usr/bin/env bash
# scripts/smoke-critical-paths.sh
#
# Run after every Vercel deploy to verify the four critical paths render
# their critical interactive elements server-side. Catches failures where
# a layout-level commit accidentally breaks /login or /subscribe and a
# paying user discovers it before we do.
#
# Usage:
#   ./scripts/smoke-critical-paths.sh
#   ./scripts/smoke-critical-paths.sh https://staging.solray.ai
#
# Exits non-zero on any check failure so CI or a deploy script can halt.

set -euo pipefail

BASE="${1:-https://app.solray.ai}"
FAIL=0

check() {
  local label="$1"
  local url="$2"
  local needle="$3"
  local body
  body="$(curl -sS -m 10 -H 'Cache-Control: no-cache' "$BASE$url" || true)"
  if printf '%s' "$body" | grep -q -- "$needle"; then
    printf '  OK   %s\n' "$label"
  else
    printf '  FAIL %s  (missing: %s)\n' "$label" "$needle"
    FAIL=1
  fi
}

echo "Smoke-checking $BASE"
echo

check "/login email field"     "/login"     'type="email"'
check "/login password field"  "/login"     'type="password"'
check "/login Enter button"    "/login"     '>Enter</button>'
check "/onboard name field"    "/onboard"   'placeholder="Your name"'
check "/onboard Continue btn"  "/onboard"   '>Continue</button>'
check "/ app shell"            "/"          'class="bg-forest-deep'
check "/subscribe page"        "/subscribe" '/subscribe'

echo
if [ "$FAIL" -ne 0 ]; then
  echo "CRITICAL PATH SMOKE TEST FAILED"
  exit 1
fi
echo "All critical paths OK"
