import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), "content/docs", path), "utf8");

it("offers one learning path and one guide collection with discoverable landing pages", () => {
  const root = JSON.parse(read("meta.json"));
  expect(root.pages).not.toContain("tutorials");
  for (const section of ["start", "concepts", "how-to", "examples", "tools", "reference"]) {
    expect(root.pages).toContain(section);
    expect(JSON.parse(read(`${section}/meta.json`)).pages).toContain("index");
    expect(read(`${section}/index.mdx`)).toContain("<DocLinks");
  }
});

it("makes YAML reference syntax reachable from the introduction and concepts", () => {
  expect(read("index.mdx")).toContain("/docs/concepts/yaml-references");
  expect(JSON.parse(read("concepts/meta.json")).pages).toContain("yaml-references");
  const syntax = read("concepts/yaml-references.mdx");
  for (const form of [
    "${values.",
    "${project.id}",
    "${environment.name}",
    "${file:",
    "${secret:",
    "${envvar:",
    "$${",
    "{{",
  ])
    expect(syntax).toContain(form);
  expect(syntax).toContain("VALUES_SELF_REFERENCE");
  expect(syntax).toContain("UNKNOWN_CODE_VALUE");
});

it("separates the core workflow from today's supported platform combinations", () => {
  expect(read("start/choose-a-route.mdx")).toContain("ADF-only");
  expect(read("reference/packs/index.mdx")).toContain("ADF-only");
  expect(read("how-to/plan-and-generate.mdx")).toContain("does not deploy");
});
