import { readFileSync, mkdtempSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { run } from "../src/index.js";
import { projectSources, projectRoutes } from "../src/project-choices.js";
const cases = JSON.parse(
  readFileSync(new URL("../../../spec/cli/conformance/projects.json", import.meta.url), "utf8"),
) as {
  routes: { connector: string; connectivity: string; via: string[] }[];
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
it.each(cases.invalid)("rejects incompatible project choices %s before writing", (...args) => {
  const cwd = mkdtempSync(join(tmpdir(), "dynamic-project-"));
  const code = run(["init", "project", ...args], { cwd, write: () => {} });
  expect(code).toBe(1);
  expect(existsSync(join(cwd, "project"))).toBe(false);
});
const combinations = projectSources().flatMap((source) =>
  projectRoutes(source.id).map((route) => ({ connector: source.id, via: route.via })),
);
it.each(combinations)("creates and validates $connector via $via", ({ connector, via }) => {
  const cwd = mkdtempSync(join(tmpdir(), "dynamic-project-"));
  let output = "";
  expect(
    run(["init", "project", "--connector", connector, "--via", via, "--yes"], {
      cwd,
      write: (text) => {
        output += text;
      },
    }),
    output,
  ).toBe(0);
  expect(output).toContain(via);
  expect(
    run(["apply", "--definitions", "project", "--out", "project/build", "--no-diff"], {
      cwd,
      write: () => {},
    }),
  ).toBe(0);
  expect(
    run(["check", "--definitions", "project", "--out", "project/build"], {
      cwd,
      write: () => {},
    }),
  ).toBe(0);
});

it("checks the standard before creating any project files", () => {
  const cwd = mkdtempSync(join(tmpdir(), "dynamic-standard-"));
  writeFileSync(
    join(cwd, "standard.yaml"),
    "apiVersion: ingestron.io/v1\nkind: Standard\nid: direct\npacks: [databricks@1]\n",
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
