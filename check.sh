#!/usr/bin/env bash
# Typecheck + build + all tests for the Estudio monorepo.
# Exits non-zero on the first failure. Run from a clean clone after `npm install`.
set -euo pipefail
cd "$(dirname "$0")"

echo "==> typecheck"
npm run -w shared build # emits dist + .d.ts; server/web typechecks resolve against it
npm run -w server typecheck
npm run -w web typecheck

echo "==> build"
npm run -w server build
npm run -w web build

echo "==> test"
npx vitest run

echo "==> check.sh OK"
