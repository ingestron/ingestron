// Every library under packages/ is ready to publish to npm: public, with the
// fields npm shows and files that exist.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const packagesFolder = join(import.meta.dirname, "../packages");
const packages = readdirSync(packagesFolder).map((folder) => ({
  folder: join(packagesFolder, folder),
  json: JSON.parse(readFileSync(join(packagesFolder, folder, "package.json"), "utf8")),
}));

test("every package is public, with the fields npm shows", () => {
  for (const { json } of packages) {
    assert.equal(json.private, undefined, `${json.name}: private`);
    assert.deepEqual(json.publishConfig, { access: "public" }, json.name);
    assert.equal(json.license, "Apache-2.0", json.name);
    assert.equal(json.author, "IntentLabs <hello@ingestron.io>", json.name);
    assert.equal(json.homepage, "https://docs.ingestron.io", json.name);
    assert.match(json.repository?.url ?? "", /^git\+https:\/\/github\.com\/ingestron\//, json.name);
    assert.match(json.bugs?.url ?? "", /^https:\/\/github\.com\/ingestron\/.+\/issues$/, json.name);
    assert.match(json.version, /^\d+\.\d+\.\d+$/, json.name);
  }
});

test("every file a package lists exists", () => {
  for (const { folder, json } of packages)
    for (const file of json.files.filter((name) => !["dist", "NOTICE"].includes(name)))
      assert.ok(existsSync(join(folder, file)), `${json.name}: ${file}`);
});

test("every package ships the NOTICE, copied in when it is packed", () => {
  for (const { json } of packages) {
    assert.ok(json.files.includes("NOTICE"), json.name);
    assert.match(json.scripts.prepack, /cp \.\.\/\.\.\/NOTICE NOTICE/, json.name);
  }
});
