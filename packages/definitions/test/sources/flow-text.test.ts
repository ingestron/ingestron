// A flow's text is read once for a resolution, not once for each of its tables, and the
// reference lists the SourceMetadata kind.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { memoryFiles, type FileSource } from "@ingestron/config";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import {
  documentReference,
  referenceKinds,
  resolveDefinitions,
  type PackInfo,
} from "../../src/index.js";

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
  });

  it("resolves 2,000 tables with source metadata in under 2 s", () => {
    const files = memoryFiles(project(2000));
    // The best of three, so that other test files running at the same time do not decide it.
    const seconds = Math.min(
      ...[1, 2, 3].map(() => {
        const started = performance.now();
        resolve(files);
        return (performance.now() - started) / 1000;
      }),
    );
    expect(seconds).toBeLessThan(2);
  }, 20_000);

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
});
