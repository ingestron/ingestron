// The CI templates run the published CLI, not this repository's build.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const read = (file) => readFileSync(join(import.meta.dirname, "../ci-templates", file), "utf8");
const templates = ["github-actions/ingestron-check.yml", "azure-devops/ingestron-check.yml"];

test("each template runs ingestron check from npm", () => {
  for (const file of templates) {
    const text = read(file);
    assert.match(text, /npx --yes ingestron@1 check/, file);
    assert.doesNotMatch(text, /pnpm|node packages\//, file);
  }
});

test("each template installs Node 22", () => {
  assert.match(read(templates[0]), /actions\/setup-node@v4[\s\S]*node-version: 22/);
  assert.match(read(templates[1]), /NodeTool@0[\s\S]*versionSpec: 22\.x/);
});
