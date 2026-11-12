// Completion from the recipe catalog: a connection's metadata.from and the keys of metadata.with,
// on the project of source-project.ts.
import { describe, expect, it } from "vitest";
import { at, brief, files, useSourceProject } from "./source-project.js";

useSourceProject();

describe("a connection's metadata.from", () => {
  it("offers each recipe with its title", () => {
    const other = files["recipes/acme.yaml"]!.replace("id: acme", "id: other").replace(
      "title: Acme ERP",
      "title: Another source",
    );
    const items = at("connections/erp.yaml", (text) => text.replace("from: acme", "from: |"), {
      "recipes/other.yaml": other,
    });
    expect(brief(items)).toEqual(
      expect.arrayContaining([
        ["acme", "Acme ERP"],
        ["other", "Another source"],
      ]),
    );
  });

  it("offers no recipe while a project recipe is broken", () => {
    const items = at("connections/erp.yaml", (text) => text.replace("from: acme", "from: |"), {
      "recipes/bad.yaml": "id: bad\n",
    });
    expect(items.map((item) => item.label)).not.toContain("acme");
    expect(items.map((item) => item.detail)).not.toContain("Acme ERP");
  });
});

describe("the keys of a connection's metadata.with", () => {
  it("offers the recipe's inputs with their descriptions, leaving out those written", () => {
    const items = at("connections/erp.yaml", (text) =>
      text.replace("    tenant: north", "    tenant: north\n    |"),
    );
    expect(items.map((item) => item.label)).toEqual(["region"]);
    expect(items[0]?.documentation).toBe("The region the tenant is hosted in.");
  });

  it("offers every input before any is written", () => {
    const items = at("connections/erp.yaml", (text) => text.replace("    tenant: north", "    |"));
    expect(items.map((item) => item.label)).toEqual(["tenant", "region"]);
  });

  it("offers none for a recipe that does not exist", () => {
    const items = at("connections/erp.yaml", (text) =>
      text.replace("from: acme", "from: nothing").replace("    tenant: north", "    |"),
    );
    expect(items).toEqual([]);
  });
});
