// A flow's text is read once for a resolution, not once for each of its tables, and the
// reference lists the SourceMetadata kind.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { memoryFiles, type FileSource } from "@ingestron/config";
import { parse } from "yaml";
import { describe, expect, it, vi } from "vitest";
import type * as Match from "../../src/sources/match.js";
import {
  documentReference,
  referenceKinds,
  resolveDefinitions,
  type PackInfo,
} from "../../src/index.js";

/** What the matching of flow tables does, counted: the index made, and each call's use of it. */
const matching = vi.hoisted(() => ({ indexes: 0, calls: 0, withIndex: 0 }));
vi.mock("../../src/sources/match.js", async (importOriginal) => {
  const original = await importOriginal<typeof Match>();
  return {
    ...original,
    indexTables: (...args: Parameters<typeof original.indexTables>) => {
      matching.indexes += 1;
      return original.indexTables(...args);
    },
    matchObject: (...args: Parameters<typeof original.matchObject>) => {
      matching.calls += 1;
      if (args[4] !== undefined) matching.withIndex += 1;
      return original.matchObject(...args);
    },
  };
});

const pack = parse(
  readFileSync(
    join(import.meta.dirname, "../../../../spec/definitions/conformance/pack.yaml"),
    "utf8",
  ),
) as PackInfo;

/** A project whose one flow has `count` tables, each in the source metadata of its connection. */
function project(count: number, flowText?: string): Record<string, string> {
  const numbers = Array.from({ length: count }, (_, index) => index);
  const tables = numbers.map((n) => `  t${n}: { object: ERP.dbo.T${n} }`).join("\n");
  const entries = numbers
    .map(
      (n) =>
        `  - object: ERP.dbo.T${n}\n    captured: { at: 2026-11-12T09:30:00Z, from: catalog, file: erp.csv }\n    columns:\n      - { name: id, logicalType: integer, required: true, primaryKeyPosition: 1 }`,
    )
    .join("\n");
  return {
    "project.yaml": "id: retail\nimports: ['*.yaml', 'sources/*.yaml']\n",
    "standard.yaml": "apiVersion: ingestron.io/v1\nkind: Standard\nid: acme\npacks: [test@1]\n",
    "erp.yaml":
      "apiVersion: ingestron.io/v1\nkind: Connection\nid: erp\nconnector: files\nconnectivity: public\nsettings: { path: /data/erp }\n",
    "sales.yaml":
      flowText ??
      `apiVersion: ingestron.io/v1\nkind: Flow\nid: sales\nsource: erp\ntables:\n${tables}\n`,
    "sources/erp.yaml": `apiVersion: ingestron.io/v1\nkind: SourceMetadata\nid: erp\nconnection: erp\nnames: { parts: 3, caseSensitive: false }\ntables:\n${entries}\n`,
  };
}

/** The files, and how many times each was read. */
function counted(files: Record<string, string>): {
  source: FileSource;
  reads: Map<string, number>;
} {
  const inner = memoryFiles(files);
  const reads = new Map<string, number>();
  const source: FileSource = {
    ...inner,
    read: (path) => {
      reads.set(path, (reads.get(path) ?? 0) + 1);
      return inner.read(path);
    },
  };
  return { source, reads };
}

const resolve = (source: FileSource) =>
  resolveDefinitions(source, { packs: [pack], envvars: {}, sourceTables: true });

describe("a flow's text in one resolution", () => {
  it("is read the same number of times for 2,000 tables as for 20", () => {
    const small = counted(project(20));
    const smallResult = resolve(small.source);
    expect(smallResult.diagnostics.map((item) => item.code)).not.toContain(
      "SOURCE_OBJECT_AMBIGUOUS",
    );
    expect(smallResult.sourceTables?.filter((item) => item.entry)).toHaveLength(20);

    const large = counted(project(2000));
    const result = resolve(large.source);
    expect(result.sourceTables?.filter((item) => item.entry)).toHaveLength(2000);
    expect(large.reads.get("sales.yaml")).toBe(small.reads.get("sales.yaml"));
    // Not one read: the flow is read once by each of three steps of a resolution, whatever the
    // number of tables. Loading the documents reads it, matching the objects reads it once for
    // the text as written (one parse shared by every table), and the placeholder warnings read it.
    expect(large.reads.get("sales.yaml")).toBe(3);
  });

  it("indexes the document once and matches every table through the index", () => {
    // A bound on time would pass on a full scan for each table (about 16 million comparisons for
    // 4,000 tables); this counts what the matching does instead, and the unit tests of
    // `matchObject` count the comparisons each call makes.
    for (const key of Object.keys(matching) as (keyof typeof matching)[]) matching[key] = 0;
    const result = resolve(memoryFiles(project(4000)));
    expect(result.sourceTables?.filter((item) => item.entry)).toHaveLength(4000);
    expect(matching.indexes).toBe(1);
    expect(matching.calls).toBe(4000);
    expect(matching.withIndex).toBe(4000);
  });

  it("compares every table when the last part of the flow's object is a reference", () => {
    const flow = `apiVersion: ingestron.io/v1\nkind: Flow\nid: sales\nsource: erp\ntables:\n  one: { object: "ERP.dbo.\${values.t}" }\n`;
    const files = project(3, flow);
    files["project.yaml"] =
      "id: retail\nenvironments: { dev: {} }\nvalues: { t: T1 }\nimports: ['*.yaml', 'sources/*.yaml']\n";
    const result = resolveDefinitions(memoryFiles(files), {
      packs: [pack],
      environment: "dev",
      envvars: {},
      sourceTables: true,
    });
    // A last part that is a reference matches every table with the other parts: the full scan.
    const ambiguous = result.diagnostics.find((item) => item.code === "SOURCE_OBJECT_AMBIGUOUS");
    expect(ambiguous?.message).toContain("ERP.dbo.T0, ERP.dbo.T1, ERP.dbo.T2");
  });

  it("compares a reference literally when the flow's text cannot be read again", () => {
    // The text is read to load the documents, and then to see which parts of an object are
    // references. Where it cannot be read the second time, the resolved text stands in for it.
    const flow = `apiVersion: ingestron.io/v1\nkind: Flow\nid: sales\nsource: erp\ntables:\n  one: { object: "\${values.db}.dbo.T1" }\n`;
    const files = project(3, flow);
    files["project.yaml"] =
      "id: retail\nenvironments: { dev: {} }\nvalues: { db: OTHER }\nimports: ['*.yaml', 'sources/*.yaml']\n";
    const inner = memoryFiles(files);
    let reads = 0;
    const lost: FileSource = {
      ...inner,
      read: (path) => (path === "sales.yaml" && ++reads > 1 ? undefined : inner.read(path)),
    };
    const entry = (from: FileSource) =>
      resolveDefinitions(from, {
        packs: [pack],
        environment: "dev",
        envvars: {},
        sourceTables: true,
      }).sourceTables?.[0]?.entry?.object;
    // With the text, `${values.db}` is a part that matches anything, so OTHER matches ERP.
    expect(entry(inner)).toBe("ERP.dbo.T1");
    // Without it, the part is the resolved OTHER, compared as it stands: no table.
    expect(entry(lost)).toBeUndefined();
  });

  it("is read again by the next resolution of the same files, so a changed text is never stale", () => {
    const { source, reads } = counted(project(3));
    resolve(source);
    const once = reads.get("sales.yaml");
    resolve(source);
    expect(reads.get("sales.yaml")).toBe(2 * (once ?? 0));
  });
});

describe("the reference", () => {
  it("lists the SourceMetadata kind with its fields", () => {
    expect(referenceKinds.SourceMetadata.schema).toBeDefined();
    const fields = documentReference("SourceMetadata");
    const paths = fields.map((field) => field.path.join("/"));
    expect(paths).toContain("connection");
    expect(paths).toContain("tables");
    expect(paths).toContain("tables/*/object");
    expect(paths).toContain("tables/*/columns/*/name");
    expect(fields.find((field) => field.path.join("/") === "connection")?.docs).toBe(
      "/docs/reference/documents#sourcemetadata-connection",
    );
  });

  it("shows the description written beside a $ref, not the referenced column's", () => {
    const fields = documentReference("SourceMetadata");
    const items = fields.find((field) => field.path.join("/") === "tables/*/columns/*/items");
    expect(items?.description).toBe("The element of a column whose logical type is `array`.");
    // The same column definition gives a list of columns its own, other description.
    const nested = fields.find((field) => field.path.join("/") === "tables/*/columns/*/properties");
    expect(nested?.description).toBe("The fields of a column whose logical type is `object`.");
  });
});
