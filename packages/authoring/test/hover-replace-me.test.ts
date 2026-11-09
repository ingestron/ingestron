// Hover on REPLACE_ME says what the field is, where to find the value and a suggestion.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { replaceMeHelp } from "../src/hover/replace-me.js";
import { hoverAt } from "../src/hover/hover.js";
import { openProject } from "../src/project/project.js";
import { filledTemplates } from "./starters.js";

const retail = join(filledTemplates, "retail");
const read = (file: string) => readFileSync(join(retail, file), "utf8");

function opened(changes: Record<string, string>) {
  const open = new Map(Object.entries(changes).map(([file, text]) => [join(retail, file), text]));
  return openProject(retail, open);
}

describe("hover on REPLACE_ME", () => {
  const platform = `${read("platform.yaml")}  warehouse_id: REPLACE_ME\n`;
  const project = opened({ "platform.yaml": platform });

  it("says what a platform section's field is, where to find it and a suggestion", () => {
    const shown = hoverAt(
      project,
      "platform.yaml",
      platform,
      platform.indexOf("REPLACE_ME") + 2,
      "dev",
    )!;
    expect(shown).toContain("**warehouse_id** still needs a value.");
    expect(shown).toContain("SQL warehouse that runs the bundle's SQL tasks.");
    expect(shown).toContain(
      "Where to find it: SQL Warehouses: the warehouse, then Connection details; the ID is in its HTTP path.",
    );
    expect(shown).toContain("Suggested: `<warehouse id>`");
    expect(shown).not.toContain("For example");
    expect(shown).toContain("[Reference](/docs/reference/packs/databricks#platform-warehouse-id)");
  });

  it("explains the field that holds a composed value", () => {
    const connection = read("connections/shop.yaml").replace(
      "${values.storage_account}",
      "REPLACE_ME",
    );
    const opens = opened({ "connections/shop.yaml": connection });
    const shown = hoverAt(
      opens,
      "connections/shop.yaml",
      connection,
      connection.indexOf("REPLACE_ME") + 2,
      "dev",
    )!;
    expect(shown).toContain("**path** still needs a value.");
  });

  it("explains the setting that reads a project value", () => {
    const changed = read("project.yaml").replace(
      /storage_account: \S+/,
      "storage_account: REPLACE_ME",
    );
    const opens = opened({ "project.yaml": changed });
    const at = changed.indexOf("storage_account: REPLACE_ME") + "storage_account: ".length + 2;
    const shown = hoverAt(opens, "project.yaml", changed, at, "dev")!;
    expect(shown).toContain("**path** still needs a value.");
  });

  it("gives the help as data, preferring a field that reads the value on its own", () => {
    const text = read("project.yaml").replace(
      /storage_account: \S+/,
      "storage_account: REPLACE_ME",
    );
    const opens = opened({ "project.yaml": text });
    const help = replaceMeHelp(
      opens,
      "project.yaml",
      "/environments/dev/values/storage_account",
      "dev",
    );
    expect(help?.field).toBe("path");
    expect(
      replaceMeHelp(opens, "project.yaml", "/values/nothing_reads_this", "dev"),
    ).toBeUndefined();
    const warehouse = replaceMeHelp(project, "platform.yaml", "/databricks/warehouse_id", "dev");
    expect(warehouse).toMatchObject({
      field: "warehouse_id",
      find: "SQL Warehouses: the warehouse, then Connection details; the ID is in its HTTP path.",
      suggest: "<warehouse id>",
    });
  });

  it("shows For example when a field only has examples", () => {
    const flow = read("flows/shop.yaml").replace("source: shop", "source: REPLACE_ME");
    const opens = opened({ "flows/shop.yaml": flow });
    const shown = hoverAt(opens, "flows/shop.yaml", flow, flow.indexOf("REPLACE_ME") + 2, "dev")!;
    expect(shown).toContain("**source** still needs a value.");
    expect(shown).toContain("For example: `shop`.");
    expect(shown).not.toContain("Suggested");
    const help = replaceMeHelp(opens, "flows/shop.yaml", "/source", "dev");
    expect(help?.suggest).toBe("shop");
  });
});

describe("a REPLACE_ME inside a list", () => {
  it("explains a list item by its index in the pointer", () => {
    const platform = read("platform.yaml").replace('["${values.on_failure}"]', "[REPLACE_ME]");
    const opens = opened({ "platform.yaml": platform });
    const help = replaceMeHelp(opens, "platform.yaml", "/alerts/0/to/0", "dev");
    expect(help).toMatchObject({
      field: "to",
      description: "An email address told when the alert fires.",
      suggest: "<team>@<domain>",
    });
    expect(help?.find).toMatch(/^Your team decides it/);
    const shown = hoverAt(
      opens,
      "platform.yaml",
      platform,
      platform.indexOf("REPLACE_ME") + 2,
      "dev",
    )!;
    expect(shown).toContain("Suggested: `<team>@<domain>`");
  });
});

describe("a project value that two files read", () => {
  it("prefers the field that reads it as its whole value", () => {
    const project = read("project.yaml").replace(/host: \S+/, "host: REPLACE_ME");
    // platform.yaml reads ${values.host} as the whole of databricks.workspace.host.
    const shown = hoverAt(
      opened({ "project.yaml": project }),
      "project.yaml",
      project,
      project.indexOf("host: REPLACE_ME") + "host: ".length + 2,
      "dev",
    )!;
    expect(shown).toContain("**host** still needs a value.");
  });
});
