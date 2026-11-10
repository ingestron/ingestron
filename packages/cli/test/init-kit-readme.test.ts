// Where README.md says to find each value (spec/cli/projects.md, "README.md", item 3): a kit
// project's Platform values take the field reference's `find`, as the editor's hover does; a
// starter's keep "Your platform team".
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { packs } from "@ingestron/core";
import { documentReference, platformSectionReference } from "@ingestron/definitions";
import { describe, expect, it } from "vitest";
import { databricksKit, ingestron, offlineCatalogue, temp } from "./kit-catalogue.js";

offlineCatalogue();

/** README.md's "Where to find it" for the row named `name`. */
function whereToFind(readme: string, name: string): string | undefined {
  const row = readme.split("\n").find((line) => line.startsWith(`| \`${name}\` |`));
  return row?.split(" | ")[3];
}

/** The field reference's `find` at `path`, `*` standing for a list item. */
function referenceFind(path: string[]): string {
  const databricks = packs.find((pack) => pack.id === "databricks")!;
  const fields = [...platformSectionReference(databricks), ...documentReference("Platform")];
  const field = fields.find((item) => item.path.join(".") === path.join("."));
  expect(field?.find, path.join(".")).toBeTypeOf("string");
  return field!.find!;
}

describe("README.md: where to find each value", () => {
  it("a Databricks kit project gives the field reference's find for its Platform values", () => {
    const cwd = temp();
    const created = ingestron(
      cwd,
      "init",
      "sales",
      "--kit",
      `${databricksKit.id}@${databricksKit.version}`,
    );
    expect(created.code, created.output).toBe(0);
    const readme = readFileSync(join(cwd, "sales/README.md"), "utf8");
    const expected: Record<string, string[]> = {
      to: ["alerts", "*", "to", "*"],
      host: ["databricks", "workspace", "host"],
      service_principal_name: ["databricks", "run_as", "service_principal_name"],
      group_name: ["databricks", "permissions", "*", "group_name"],
    };
    for (const [name, path] of Object.entries(expected))
      expect(whereToFind(readme, name), name).toBe(referenceFind(path));
    expect(readme).not.toContain("Your platform team");
  });

  it("the retail starter keeps Your platform team for the same fields", () => {
    const cwd = temp();
    const created = ingestron(cwd, "init", "shop", "--template", "retail", "--yes");
    expect(created.code, created.output).toBe(0);
    const readme = readFileSync(join(cwd, "shop/README.md"), "utf8");
    for (const name of ["on_failure", "host", "run_as", "engineers", "analysts"])
      expect(whereToFind(readme, name), name).toBe("Your platform team");
  });
});
