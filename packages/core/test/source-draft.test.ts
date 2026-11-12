// Drafting contracts from source metadata: the conformance cases in
// spec/cli/conformance/sources/drafts/, and what a draft carries.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { draftContracts } from "../src/index.js";
import { awkward, folder, host, project, propertyOf, type Column } from "./source-draft-fixture.js";

interface DraftCase {
  name: string;
  tables?: string[];
  needed?: boolean;
  drafts: { table: string; path: string; id: string; text: string }[];
  problems: string[];
}

const cases = JSON.parse(readFileSync(join(folder, "cases.json"), "utf8")) as {
  drafts: DraftCase[];
};
const expected = (name: string): string => readFileSync(join(folder, "expected", name), "utf8");

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

  it("reads back as the entry: every column, its options, required, key and nesting", () => {
    const { drafts } = draftContracts(project(), { ...host, tables: ["sales.orders"] });
    const entry = (parse(drafts[0]!.text) as { schema: { name: string; properties: unknown[] }[] })
      .schema[0]!;
    const metadata = (
      parse(readFileSync(join(folder, "sources/erp.yaml"), "utf8")) as {
        tables: { object: string; columns: Column[] }[];
      }
    ).tables.find((table) => table.object === "ERP.dbo.Orders")!;
    expect(entry.name).toBe("orders");
    expect(entry.properties).toEqual(metadata.columns.map(propertyOf));
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

  it("writes names YAML cannot start a plain value with, or reads as another value, in quotes", () => {
    const columns = awkward
      .map(
        (name) => `      - { name: ${JSON.stringify(name)}, logicalType: string, required: false }`,
      )
      .join("\n");
    const landing = `apiVersion: ingestron.io/v1
kind: SourceMetadata
id: landing
connection: landing
tables:
  - object: events
    captured: { at: 2026-11-10T14:00:00Z, from: sample, file: sources/landing/events.csv }
    columns:
${columns}
`;
    const { drafts, problems } = draftContracts(project({ "sources/landing.yaml": landing }), {
      ...host,
      tables: ["landing.events"],
    });
    expect(problems).toEqual([]);
    const properties = (parse(drafts[0]!.text) as { schema: { properties: { name: string }[] }[] })
      .schema[0]!.properties;
    expect(properties.map((property) => property.name)).toEqual(awkward);
    expect(drafts[0]!.text).toContain('- name: "yes"');
    expect(drafts[0]!.text).toContain('- name: "@x"');
  });

  it("keeps a line break in the object or the file on the header's line", () => {
    const object = "ev\\nents";
    const landing = readFileSync(join(folder, "sources/landing.yaml"), "utf8")
      .replace("object: events", `object: "${object}"`)
      .replace("file: sources/landing/events.csv", 'file: "a\\rb.csv"');
    const flow = readFileSync(join(folder, "flows/landing.yaml"), "utf8").replace(
      "object: events",
      `object: "${object}"`,
    );
    const { drafts } = draftContracts(
      project({ "sources/landing.yaml": landing, "flows/landing.yaml": flow }),
      { ...host, tables: ["landing.events"] },
    );
    const [header] = drafts[0]!.text.split("\n");
    expect(header).toBe(
      '# Drafted from "ev\\nents" in sources/landing.yaml (sample, captured 2026-11-10).',
    );
  });

  it("writes a name YAML would misread in quotes", () => {
    const { drafts } = draftContracts(project(), { ...host, tables: ["landing.events"] });
    const properties = (parse(drafts[0]!.text) as { schema: { properties: { name: string }[] }[] })
      .schema[0]!.properties;
    expect(properties.map((property) => property.name)).toContain("yes: no");
  });
});
