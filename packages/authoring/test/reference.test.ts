// The reference entry for the place under the cursor: problems there, the
// field or value, or the document kind.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openProject } from "../src/project.js";
import { referenceAt } from "../src/reference.js";

const erp = join(import.meta.dirname, "../../../samples/starters/private-sql-server");
const retail = join(import.meta.dirname, "../../../samples/starters/retail");

/** The entry where `|` is in the edited text of `path` in `folder`. */
function at(folder: string, path: string, edit: (text: string) => string = (text) => text) {
  const marked = edit(readFileSync(join(folder, path), "utf8"));
  const text = marked.replace("|", "");
  const project = openProject(folder, new Map([[join(folder, path), text]]));
  return referenceAt(project, path, text, marked.indexOf("|"), "dev");
}

describe("referenceAt", () => {
  it("describes a setting, marking the value written", () => {
    const entry = at(erp, "standard.yaml", (text) =>
      text.replace("mode: incremental", "mode: incr|emental"),
    );
    expect(entry).toMatchObject({
      title: "mode",
      subtitle: "Setting of adf-copy",
      text: "What each window copies.",
      docs: "/docs/reference/packs/adf#adf-copy-mode",
    });
    expect(entry?.values?.find((item) => item.current)?.value).toBe("incremental");
    expect(entry?.facts).toContainEqual({ label: "Default", value: "full", code: true });
    expect(entry?.facts).toContainEqual({ label: "Usually in", value: "a flow or transform" });
  });

  it("shows the problems on the line first, with their meaning and fixes", () => {
    const entry = at(retail, "flows/shop.yaml", (text) =>
      text.replace("source: shop", "source: sho|ps"),
    );
    expect(entry?.problems).toMatchObject([
      {
        code: "BROKEN_LINK",
        message: '"shops" is not the id of a Connection document.',
        meaning: expect.stringMatching(/\S/),
        fixes: ['Change to "shop"', 'Create Connection "shops"'],
        docs: "/docs/reference/errors#BROKEN_LINK",
      },
    ]);
    expect(entry?.title).toBe("source");
  });

  it("describes the document when the cursor is on nothing in particular", () => {
    const entry = at(retail, "flows/shop.yaml", (text) => `|${text}`);
    expect(entry).toMatchObject({ title: "Flow", subtitle: "Document" });
    expect(entry?.fields?.map((field) => field.name)).toEqual(
      expect.arrayContaining(["source", "tables"]),
    );
  });

  it("has nothing for a file that is not a definition", () => {
    expect(at(retail, "transforms/daily_sales.sql")).toBeUndefined();
  });

  it("describes a method under settings: what it does, which tables use it and what chose it", () => {
    const entry = at(erp, "platform.yaml", (text) => text.replace("adf-copy:", "adf-co|py:"));
    expect(entry).toMatchObject({
      title: "adf-copy",
      subtitle: "Method of the adf pack (ingest)",
      docs: "/docs/reference/packs/adf#adf-copy",
    });
    expect(entry?.usedBy).toEqual([
      "`customers` (ingest): chosen by the adf pack's rule for `connectivity: private`",
      "`invoices` (ingest): chosen by the adf pack's rule for `connectivity: private`",
    ]);
    expect(entry?.fields?.map((field) => field.name)).toEqual(
      expect.arrayContaining(["landing", "mode", "every"]),
    );
  });
});

describe("referenceAt in a contract", () => {
  it("describes a column's type, its meaning, and what Ingestron does with it", () => {
    const entry = at(retail, "contracts/orders.yaml", (text) =>
      text.replace("logicalType: integer", "logicalType: inte|ger"),
    );
    expect(entry).toMatchObject({
      title: "logicalType",
      subtitle: "Field of DataContract",
      docs: "/docs/reference/documents#datacontract-schema-item-properties-item-logicaltype",
    });
    expect(entry?.text).toContain("The standard's `types`");
    expect(entry?.values?.find((item) => item.current)).toEqual({
      value: "integer",
      text: "A whole number.",
      current: true,
    });
  });

  it("describes the contract on its header", () => {
    const entry = at(retail, "contracts/orders.yaml", (text) => `|${text}`);
    expect(entry).toMatchObject({ title: "DataContract", subtitle: "Document" });
    expect(entry?.fields?.map((field) => field.name)).toEqual(
      expect.arrayContaining(["schema", "status"]),
    );
  });
});

describe("referenceAt on a contract field", () => {
  it("says what each of the project's packs does with it", () => {
    const entry = at(erp, "contracts/customers.yaml", (text) =>
      text.replace(
        "{ name: name, logicalType: string }",
        "{ name: name, logicalType: string, uni|que: true }",
      ),
    );
    expect(entry?.title).toBe("unique");
    expect(entry?.packs).toEqual([
      {
        pack: "databricks",
        status: "Off",
        text: expect.stringMatching(
          /^A table check after each refresh that no value repeats\. Turn on `manage\.checks` in the platform\. It needs: SELECT/,
        ),
      },
      { pack: "adf", status: "Elsewhere", text: "Handled where the table is stored." },
    ]);
  });
});

describe("referenceAt on a new list item", () => {
  it("describes the list it is in", () => {
    const entry = at(retail, "contracts/orders.yaml", (text) =>
      text.replace(
        '      - { name: total, logicalType: number, physicalType: "DECIMAL(18,2)" }',
        "      - name: total\n        logicalType: number\n        quality:\n          - |",
      ),
    );
    expect(entry).toMatchObject({ title: "quality", subtitle: "Field of DataContract" });
    expect(entry?.packs?.[0]).toMatchObject({ pack: "databricks", status: "Used" });
  });
});

describe("connection settings", () => {
  it("describes path from its connector, with how a table's object is found under it", () => {
    const entry = at(retail, "connections/shop.yaml", (text) =>
      text.replace("  path:", "  pa|th:"),
    );
    expect(entry).toMatchObject({
      title: "path",
      subtitle: "Setting of the Files connector",
      docs: "/docs/connectors/files",
    });
    expect(entry?.text).toContain("Where the files land");
    expect(entry?.text).toContain("a folder under the connection's path");
  });
});
