// The packed npm package installs offline into an empty folder and works there.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { packCli } from "./pack-cli.mjs";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";

test(
  "packs a self-contained ingestron package that installs and runs",
  { timeout: 300_000 },
  async () => {
    const tarball = await packCli();
    const entries = execFileSync("tar", ["-tzf", tarball], { encoding: "utf8" }).split("\n");
    for (const entry of [
      "package/LICENSE",
      "package/NOTICE",
      "package/README.md",
      "package/dist/main.js",
      "package/THIRD_PARTY_NOTICES",
      "package/project-templates/minimal/project.yaml",
      "package/project-templates/duckdb/gitignore",
      "package/project-templates/duckdb/published/.gitkeep",
      "package/project-templates/duckdb/samples/orders.csv",
    ])
      assert.ok(entries.includes(entry), entry);
    assert.ok(entries.some((entry) => entry.startsWith("package/schemas/")));
    assert.ok(entries.some((entry) => entry.startsWith("package/templates/")));
    const manifest = JSON.parse(
      execFileSync("tar", ["-xzOf", tarball, "package/package.json"], { encoding: "utf8" }),
    );
    assert.equal(manifest.name, "ingestron");
    assert.equal(manifest.license, "Apache-2.0");
    assert.equal(manifest.dependencies, undefined);
    const notices = execFileSync("tar", ["-xzOf", tarball, "package/THIRD_PARTY_NOTICES"], {
      encoding: "utf8",
    });
    for (const name of ["yaml", "ajv", "liquidjs", "fast-uri"])
      assert.match(notices, new RegExp(`^## ${name}@`, "m"));
    assert.match(notices, /Permission is hereby granted/);
    assert.doesNotMatch(notices, /@ingestron\//);

    const folder = mkdtempSync(join(tmpdir(), "ingestron-install-"));
    const quiet = { cwd: folder, encoding: "utf8" };
    execFileSync(npm, ["init", "-y"], quiet);
    execFileSync(npm, ["install", "--offline", "--no-audit", "--no-fund", tarball], quiet);
    const ingestron = (cwd, ...args) =>
      spawnSync(join(folder, "node_modules/.bin/ingestron"), args, { cwd, encoding: "utf8" });

    const help = ingestron(folder, "--help");
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /Usage: ingestron/);
    const init = ingestron(folder, "init", "demo", "--template", "minimal", "--yes");
    assert.equal(init.status, 0, init.stdout + init.stderr);
    const plan = ingestron(join(folder, "demo"), "plan");
    assert.equal(plan.status, 0, plan.stdout + plan.stderr);
    assert.match(plan.stdout, /Ready to apply\./);
  },
);
