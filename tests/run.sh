#!/usr/bin/env bash
# App unit tests for the pure lib modules. No extra dependencies: the libs
# are compiled with the project's own TypeScript to a temporary folder, then
# run with Node's built-in test runner.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out="$(mktemp -d)"
trap 'rm -rf "$out"' EXIT
"$here/../node_modules/.bin/tsc" -p "$here/tsconfig.json" --outDir "$out"
cp -r "$here/../messages" "$out/messages"
SOLRAY_TEST_BUILD="$out" node --test "$here"/*.test.cjs
