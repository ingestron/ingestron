#!/bin/sh
# Generates every sample's build/<environment>/ folder with the ingestron
# command. The output is committed so it can be read without running anything;
# packages/cli/test/examples.test.ts fails when it is out of date.
set -e
cd "$(dirname "$0")/.."
pnpm -r --silent build
for example in samples/*/*/; do
  echo "== ${example}"
  node packages/cli/dist/main.js apply --no-diff --definitions "${example}" --out "${example}build"
done
