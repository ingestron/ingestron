// Every package in the workspace, and the repository itself, is Apache-2.0.
import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = join(import.meta.dirname, "..");
const read = (path) => readFileSync(join(root, path), "utf8");

/** The root package.json and one per folder matched by pnpm-workspace.yaml's `dir/*` globs. */
function manifests() {
  const globs = [...read("pnpm-workspace.yaml").matchAll(/^\s+-\s+(\S+)\/\*\s*$/gm)];
  const folders = globs.flatMap(([, dir]) =>
    readdirSync(join(root, dir), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(dir, entry.name)),
  );
  return ["package.json", ...folders.map((folder) => join(folder, "package.json"))];
}

test("every workspace package declares Apache-2.0", () => {
  const found = manifests();
  assert.ok(found.length > 8, `expected the workspace packages, found ${found.length}`);
  for (const path of found) assert.equal(JSON.parse(read(path)).license, "Apache-2.0", path);
});

test("LICENSE is the Apache License 2.0", () => {
  const text = read("LICENSE");
  assert.match(text, /Apache License/);
  assert.match(text, /Version 2\.0, January 2004/);
});

test("NOTICE names the copyright holder", () => {
  assert.match(read("NOTICE"), /Copyright 2026 Otrera Limited, trading as IntentLabs/);
});
