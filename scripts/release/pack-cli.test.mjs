// The packed npm package installs offline into an empty folder and works there.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { packCli } from "./pack-cli.mjs";

const repository = join(import.meta.dirname, "../..");
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
      "package/kits/duckdb/local-medallion/2026-11-10/kit.yaml",
      "package/kits/duckdb/local-medallion/2026-11-10/gitignore",
      "package/kits/duckdb/local-medallion/2026-11-10/published/.gitkeep",
      "package/kits/databricks/lakehouse-streaming/2026-11-10/kit.yaml",
    ])
      assert.ok(entries.includes(entry), entry);
    assert.ok(entries.some((entry) => entry.startsWith("package/schemas/")));
    assert.ok(entries.some((entry) => entry.startsWith("package/templates/")));
    const manifest = JSON.parse(
      execFileSync("tar", ["-xzOf", tarball, "package/package.json"], { encoding: "utf8" }),
    );
    // The bundle carries the CLI's own version as a constant, and reads no package.json for it.
    const cli = JSON.parse(readFileSync(join(repository, "packages/cli/package.json"), "utf8"));
    assert.equal(manifest.version, cli.version);
    const bundle = execFileSync("tar", ["-xzOf", tarball, "package/dist/main.js"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    assert.ok(bundle.includes(`manifestVersion = ${JSON.stringify(cli.version)}`));
    assert.ok(!bundle.includes('"../package.json"'));
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
    // The bundle cannot resolve @ingestron/standards; the kits come from the copy beside it.
    // A catalogue that does not exist makes any attempt to go online fail.
    assert.ok(!existsSync(join(folder, "node_modules/@ingestron")));
    const offline = { ...process.env, INGESTRON_STANDARDS_REPOSITORY: missingCatalogue(folder) };
    const ingestron = (cwd, ...args) =>
      spawnSync(join(folder, "node_modules/.bin/ingestron"), args, {
        cwd,
        encoding: "utf8",
        env: offline,
      });

    const help = ingestron(folder, "--help");
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /Usage: ingestron/);
    const init = ingestron(folder, "init", "demo", "--template", "minimal", "--yes");
    assert.equal(init.status, 0, init.stdout + init.stderr);
    const plan = ingestron(join(folder, "demo"), "plan");
    assert.equal(plan.status, 0, plan.stdout + plan.stderr);
    assert.match(plan.stdout, /Ready to apply\./);

    const list = ingestron(folder, "standard", "list");
    assert.equal(list.status, 0, list.stdout + list.stderr);
    assert.match(
      list.stdout,
      /^Could not reach the catalogue; showing the kits installed with ingestron\./,
    );
    assert.match(list.stdout, /^databricks\/lakehouse-streaming@2026-11-10 /m);
    assert.match(list.stdout, /^duckdb\/local-medallion@2026-11-10 /m);
    const kit = ingestron(folder, "init", "local", "--kit", "duckdb/local-medallion@2026-11-10");
    assert.equal(kit.status, 0, kit.stdout + kit.stderr);
    assert.match(kit.stdout, /from the kit duckdb\/local-medallion@2026-11-10/);
    assert.ok(existsSync(join(folder, "local/STANDARD.md")));
    assert.ok(existsSync(join(folder, "local/.gitignore")));
  },
);

/** A file:// URL of a repository that is not there. */
function missingCatalogue(folder) {
  return pathToFileURL(join(folder, "no-such-catalogue.git")).href;
}
