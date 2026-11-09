import { readFileSync, mkdtempSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { parse } from "yaml";
import { run } from "../src/index.js";
import { projectSources, projectRoutes } from "@ingestron/core";
const cases = JSON.parse(
  readFileSync(new URL("../../../spec/cli/conformance/projects.json", import.meta.url), "utf8"),
) as {
  routes: { connector: string; connectivity: string; via: string[] }[];
  aliases: { given: string; means: string }[];
  invalid: string[][];
};
it("groups every available source using existing connector metadata", () => {
  const sources = projectSources();
  expect(sources).toHaveLength(77);
  expect(new Set(sources.map((source) => source.id)).size).toBe(77);
  expect(sources.every((source) => source.category && source.title)).toBe(true);
});
it.each(cases.routes)(
  "offers only the supported routes for $connector ($connectivity)",
  (entry) => {
    expect(
      projectRoutes(entry.connector, entry.connectivity)
        .map((route) => route.via)
        .sort(),
    ).toEqual([...entry.via].sort());
  },
);
it.each(cases.aliases)("accepts --via $given as $means", ({ given, means }) => {
  const create = (via: string) => {
    const cwd = mkdtempSync(join(tmpdir(), "dynamic-project-"));
    const args = ["--connector", "postgresql", "--connectivity", "private", "--via", via];
    expect(run(["init", "project", ...args, "--yes"], { cwd, write: () => {} })).toBe(0);
    return readFileSync(join(cwd, "project/standard.yaml"), "utf8");
  };
  expect(create(given)).toBe(create(means));
});
it.each(cases.invalid)("rejects incompatible project choices %s before writing", (...args) => {
  const cwd = mkdtempSync(join(tmpdir(), "dynamic-project-"));
  const code = run(["init", "project", ...args], { cwd, write: () => {} });
  expect(code).toBe(1);
  expect(existsSync(join(cwd, "project"))).toBe(false);
});
it("checks the standard before creating any project files", () => {
  const cwd = mkdtempSync(join(tmpdir(), "dynamic-standard-"));
  writeFileSync(
    join(cwd, "standard.yaml"),
    "apiVersion: ingestron.io/v1\nkind: Standard\nid: direct\npacks: [databricks@2]\n",
  );
  let output = "";
  const code = run(
    ["init", "project", "--connector", "postgresql", "--standard", "standard.yaml", "--yes"],
    {
      cwd,
      write: (text) => {
        output += text;
      },
    },
  );
  expect(code).toBe(1);
  expect(output).toContain("nothing written");
  expect(existsSync(join(cwd, "project"))).toBe(false);
});
it("rejects literal credentials before writing the project", () => {
  const cwd = mkdtempSync(join(tmpdir(), "dynamic-secret-"));
  const code = run(
    [
      "init",
      "project",
      "--connector",
      "postgresql",
      "--set",
      "source_password=not_a_secret_reference",
      "--yes",
    ],
    {
      cwd,
      write: () => {},
    },
  );
  expect(code).toBe(1);
  expect(existsSync(join(cwd, "project"))).toBe(false);
});

it.each([
  ["adf-synapse", "synapse/views.sql"],
  ["adf-duckdb", "duckdb/dev/run.sql"],
  ["adf-landing", "adf/factory/pipeline"],
])("lands with ADF and builds the %s destination's files", (via, generated) => {
  const cwd = mkdtempSync(join(tmpdir(), "dynamic-destination-"));
  const io = { cwd, write: () => {} };
  const args = ["--connector", "postgresql", "--connectivity", "private", "--via", via, "--yes"];
  expect(run(["init", "project", ...args], io)).toBe(0);
  expect(
    run(["apply", "--definitions", "project", "--out", "project/build", "--no-diff"], io),
  ).toBe(0);
  expect(existsSync(join(cwd, "project/build", generated))).toBe(true);
  expect(existsSync(join(cwd, "project/build/databricks"))).toBe(false);
});

it.each([
  [
    "adf-synapse",
    "data_source_location: abfss://landing@${values.storage_account}.dfs.core.windows.net",
  ],
  ["adf-duckdb", "published: abfss://published@${values.storage_account}.dfs.core.windows.net"],
])("puts the %s destination in the landing storage account", (via, setting) => {
  const cwd = mkdtempSync(join(tmpdir(), "dynamic-landing-"));
  let output = "";
  const io = { cwd, write: (text: string) => (output += text) };
  const args = ["--connector", "postgresql", "--connectivity", "private", "--via", via];
  const set = ["--set", "storage_account=contosolake", "--set", "prod.storage_account=contosoprod"];
  expect(run(["init", "project", ...args, ...set, "--yes"], io), output).toBe(0);
  expect(readFileSync(join(cwd, "project/platform.yaml"), "utf8")).toContain(setting);
  const project = parse(readFileSync(join(cwd, "project/project.yaml"), "utf8"));
  expect(project.environments.dev.values.storage_account).toBe("contosolake");
  expect(project.environments.prod.values.storage_account).toBe("contosoprod");
});

const named = (
  cases as unknown as {
    replaceMe: { connector: string; connectivity: string; via: string; names: string[] }[];
  }
).replaceMe;
it.each(named)(
  "writes REPLACE_ME for $connector ($connectivity) via $via under the names in the cases",
  ({ connector, connectivity, via, names }) => {
    const cwd = mkdtempSync(join(tmpdir(), "dynamic-names-"));
    const args = ["--connector", connector, "--connectivity", connectivity, "--via", via, "--yes"];
    expect(run(["init", "project", ...args], { cwd, write: () => {} })).toBe(0);
    const readme = readFileSync(join(cwd, "project/README.md"), "utf8");
    const table = readme.slice(
      readme.indexOf("## Values to replace"),
      readme.indexOf("\n## ", readme.indexOf("## Values to replace") + 5),
    );
    const rows = [...table.matchAll(/^\| `([a-z_]+)` \|/gm)].map((match) => match[1]);
    expect(rows).toEqual(names);
  },
);
