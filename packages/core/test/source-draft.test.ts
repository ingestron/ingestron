// Drafting contracts from source metadata: the conformance cases in
// spec/cli/conformance/sources/drafts/, and the round trip that proves a draft is a contract.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { resolveDefinitions } from "@ingestron/definitions";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { draftContracts, packs } from "../src/index.js";
import { resolving } from "../src/request/index.js";
import { projectIn } from "./source-request-fixture.js";

interface DraftCase {
  name: string;
  tables?: string[];
  needed?: boolean;
  drafts: { table: string; path: string; id: string; text: string }[];
  problems: string[];
}

const folder = resolve(import.meta.dirname, "../../../spec/cli/conformance/sources/drafts");
const cases = JSON.parse(readFileSync(join(folder, "cases.json"), "utf8")) as {
  drafts: DraftCase[];
};
const expected = (name: string): string => readFileSync(join(folder, "expected", name), "utf8");
const project = (changes: Record<string, string | null> = {}) => projectIn(folder, changes);
const host = { envvars: {}, environment: "dev" };

/** The sales flow with orders naming its draft, and without the table that has no entry. */
const flowWithContract = `apiVersion: ingestron.io/v1
kind: Flow
id: sales
source: erp
layer: silver
tables:
  orders: { object: "\${values.erp_db}.dbo.Orders", contract: erp.orders }
  invoices: { object: "\${values.erp_db}.dbo.Invoices", contract: invoices }
`;

describe("draftContracts: the conformance cases", () => {
  for (const item of cases.drafts) {
    it(item.name, () => {
      const result = draftContracts(project(), {
        ...host,
        ...(item.tables && { tables: item.tables }),
        ...(item.needed && { needed: item.needed }),
      });
      expect(result.drafts).toEqual(
        item.drafts.map(({ text, ...rest }) => ({ ...rest, text: expected(text) })),
      );
      expect(result.problems).toEqual(item.problems);
    });
  }
});

describe("draftContracts: what a draft carries", () => {
  it("leaves out the key of a table from an assistant, as of a sample", () => {
    const keyed = readFileSync(join(folder, "sources/landing.yaml"), "utf8")
      .replace("from: sample", "from: assistant")
      .replace("required: true }", "required: true, primaryKeyPosition: 1 }");
    const { drafts } = draftContracts(project({ "sources/landing.yaml": keyed }), {
      ...host,
      tables: ["landing.events"],
    });
    expect(drafts[0]!.text).toContain("(assistant, captured 2026-11-10).");
    expect(drafts[0]!.text).toContain("then add the key, descriptions");
    expect(drafts[0]!.text).not.toContain("primaryKey");
  });

  it("carries the key of a table captured from a document", () => {
    const keyed = readFileSync(join(folder, "sources/erp.yaml"), "utf8").replaceAll(
      "from: catalog",
      "from: document",
    );
    const { drafts } = draftContracts(project({ "sources/erp.yaml": keyed }), {
      ...host,
      tables: ["sales.orders"],
    });
    expect(drafts[0]!.text).toContain("(document, captured 2026-11-12).");
    expect(drafts[0]!.text).toContain("primaryKeyPosition: 2");
  });

  it("reads back as the entry: names, types, options, required, key and nesting", () => {
    const { drafts } = draftContracts(project(), { ...host, tables: ["sales.orders"] });
    const entry = (
      parse(drafts[0]!.text) as { schema: { name: string; properties: { name: string }[] }[] }
    ).schema[0]!;
    const metadata = (
      parse(readFileSync(join(folder, "sources/erp.yaml"), "utf8")) as {
        tables: { object: string; columns: { name: string }[] }[];
      }
    ).tables.find((table) => table.object === "ERP.dbo.Orders")!;
    expect(entry.name).toBe("orders");
    expect(entry.properties.map((property) => property.name)).toEqual(
      metadata.columns.map((column) => column.name),
    );
  });

  it("leaves out a decimal's precision and scale, which ODCS has no field for, and keeps the rest", () => {
    const { drafts } = draftContracts(project(), { ...host, tables: ["sales.orders"] });
    const text = drafts[0]!.text;
    expect(text).not.toMatch(/precision|scale/);
    expect(text).toContain("logicalTypeOptions: { maxLength: 2 }");
  });

  it("drafts nothing for neither tables nor needed", () => {
    expect(draftContracts(project(), host)).toEqual({ drafts: [], problems: [] });
  });

  it("writes a name YAML would misread in quotes", () => {
    const { drafts } = draftContracts(project(), { ...host, tables: ["landing.events"] });
    const properties = (parse(drafts[0]!.text) as { schema: { properties: { name: string }[] }[] })
      .schema[0]!.properties;
    expect(properties.map((property) => property.name)).toContain("yes: no");
  });
});

describe("draftContracts: resolving", () => {
  it("drafts although CONTRACT_NEEDED and TABLE_NO_COLUMNS leave no model", () => {
    const { diagnostics, model, sourceTables } = resolveDefinitions(project(), {
      ...resolving,
      sourceTables: true,
      packs: [...packs],
      ...host,
    });
    expect(model).toBeUndefined();
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain("CONTRACT_NEEDED");
    expect(sourceTables).toBeDefined();
    expect(draftContracts(project(), { ...host, needed: true }).drafts).toHaveLength(1);
  });

  it("stops at an error the metadata does not settle, written as plan writes it", () => {
    const broken = project({ "flows/landing.yaml": "kind: Flow\nid: landing\nsource: nowhere\n" });
    const result = draftContracts(broken, { ...host, tables: ["sales.orders"] });
    expect(result.drafts).toEqual([]);
    expect(result.problems.length).toBeGreaterThan(0);
    expect(result.problems.join("\n")).toMatch(/\.yaml:\d+:\d+ {2}error {2}[A-Z_]+/);
  });

  it("drafts nothing and reports nothing when every table that needs a contract has one", () => {
    const { drafts } = draftContracts(project(), { ...host, tables: ["sales.orders"] });
    const done = project({
      "flows/sales.yaml": flowWithContract,
      "contracts/erp.orders.yaml": drafts[0]!.text,
    });
    expect(draftContracts(done, { ...host, needed: true })).toEqual({ drafts: [], problems: [] });
  });
});

describe("draftContracts: the round trip", () => {
  const table = (files: ReturnType<typeof project>) => {
    const result = resolveDefinitions(files, {
      ...resolving,
      sourceTables: true,
      packs: [...packs],
      ...host,
    });
    return { ...result, orders: result.model?.tables.find((item) => item.name === "orders") };
  };

  it("a draft is loaded by the project's contracts/*.yaml, named by its id, and settles the table", () => {
    const { drafts } = draftContracts(project(), { ...host, tables: ["sales.orders"] });
    const { id, path, text } = drafts[0]!;
    expect(`${id}`).toBe("erp.orders");
    const named = table(project({ "flows/sales.yaml": flowWithContract, [path]: text }));
    const codes = named.diagnostics.map((diagnostic) => diagnostic.code);
    expect(named.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
    expect(codes).not.toContain("CONTRACT_NEEDED");
    expect(codes).not.toContain("TABLE_NO_COLUMNS");
    expect(codes.filter((code) => code.startsWith("SOURCE_"))).toEqual([]);
    expect(named.orders?.contract.id).toBe("erp.orders");
  });

  it("the table has the columns, types and key the metadata has", () => {
    const { drafts } = draftContracts(project(), { ...host, tables: ["sales.orders"] });
    const { path, text } = drafts[0]!;
    const drafted = table(project({ "flows/sales.yaml": flowWithContract, [path]: text }));
    // The same table kept in a layer that needs no contract takes its columns from the metadata.
    const observed = table(
      project({
        "flows/sales.yaml": flowWithContract
          .replace(/, contract: erp.orders/, "")
          .replace("layer: silver", "layer: bronze"),
      }),
    );
    expect(observed.orders?.contract.origin).toBe("metadata");
    const shape = (item: typeof drafted.orders) =>
      item!.contract.columns.map(({ name, type, logicalType }) => ({ name, type, logicalType }));
    expect(shape(drafted.orders)).toEqual(shape(observed.orders));
    expect(drafted.orders!.contract.primaryKey).toEqual(["OrderID", "Region"]);
    expect(drafted.orders!.contract.primaryKey).toEqual(observed.orders!.contract.primaryKey);
  });
});
