// Completion marks the value a standard fixes; a fixed value written with ${envvar:…} is
// never shown with what .env or the host environment holds.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { completionsAt } from "../src/assist/completion.js";
import { openProject } from "../src/project/project.js";
import { cleanEnvironment, fromFile, fromHost } from "./env-workspace.js";
import { filledTemplates } from "./starters.js";

cleanEnvironment();

const retail = join(filledTemplates, "retail");
const read = (path: string) => readFileSync(join(retail, path), "utf8");

/** Completions for `cluster_by:` in the shop flow, with the standard fixing it to `fixed`. */
function clusterBy(fixed: string, extra: Record<string, string> = {}) {
  const marked = read("flows/shop.yaml").replace(
    "except_columns: [op] }",
    "except_columns: [op], cluster_by: | }",
  );
  const text = marked.replace("|", "");
  const standard = read("standard.yaml").replace(
    "streaming-table: { cluster_by: auto }",
    `streaming-table: { cluster_by: "${fixed}" }`,
  );
  const open = new Map([
    [join(retail, "standard.yaml"), standard],
    [join(retail, "flows/shop.yaml"), text],
    ...Object.entries(extra).map(([file, content]): [string, string] => [
      join(retail, file),
      content,
    ]),
  ]);
  const project = openProject(retail, open);
  return completionsAt(project, "flows/shop.yaml", text, marked.indexOf("|"), "dev");
}

describe("a value the standard fixes", () => {
  it("still shows a plain fixed value", () => {
    expect(clusterBy("none").map((item) => [item.label, item.detail])).toEqual([
      ["none", "fixed by the standard"],
      ["auto", "not allowed: the standard fixes this to none"],
    ]);
  });

  it("never shows a value from .env", () => {
    const items = clusterBy(`\${envvar:${fromFile}}`, {
      ".env": `${fromFile}=SECRETFILEVALUE\n`,
      ".env.dev": `${fromFile}=none\n`,
    });
    expect(JSON.stringify(items)).not.toContain("SECRETFILEVALUE");
    // The value that .env holds is not offered as the fixed one.
    expect(items.some((item) => item.detail === "fixed by the standard")).toBe(false);
    expect(items.length).toBeGreaterThan(0);
  });

  it("never shows a value from the host environment", () => {
    process.env[fromHost] = "none";
    const items = clusterBy(`\${envvar:${fromHost}}`);
    expect(items.some((item) => item.detail === "fixed by the standard")).toBe(false);
    expect(JSON.stringify(items)).not.toContain('"none","detail":"not allowed');
  });

  it("never shows a secret reference", () => {
    const items = clusterBy("${secret:PW_NAME}");
    expect(JSON.stringify(items)).not.toContain("PW_NAME");
    expect(items.length).toBeGreaterThan(0);
  });
});
