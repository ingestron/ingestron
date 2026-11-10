// The intent vocabulary (specification section 11.1): layer names, the table of
// intent paths, and the load error for a layer object without a name.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { memoryFiles } from "@ingestron/config";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { intentPaths, layerNames, resolveDefinitions, type PackInfo } from "../../src/index.js";

const conformance = join(import.meta.dirname, "../../../../spec/definitions/conformance");
const read = (file: string) => parse(readFileSync(join(conformance, file), "utf8"));
const testPack = read("pack.yaml") as PackInfo;
const minimal = (read("01-minimal.yaml") as { files: Record<string, string> }).files;

describe("layerNames", () => {
  it("gives the name of each layer, written as text or as an object", () => {
    expect(layerNames(["bronze", { name: "silver", history: "latest" }])).toEqual([
      "bronze",
      "silver",
    ]);
  });

  it("gives nothing when the standard names no layers", () => {
    expect(layerNames(undefined)).toBeUndefined();
  });
});

describe("intentPaths", () => {
  it("lists every intent path in order", () => {
    expect(Object.keys(intentPaths)).toEqual([
      "load.mode",
      "load.cursor",
      "load.deletes.mode",
      "load.deletes.when",
      "history",
      "sequence",
      "audit",
      "rescued",
      "retention.time_travel",
      "retention.log",
      "retention.landed_files",
      "storage.clustering",
      "storage.features",
      "operations.schedule",
      "operations.trigger",
      "operations.retries",
      "operations.timeout",
      "operations.alerts",
      "operations.concurrency",
      "quality.results",
      "quality.rules",
      "quality.actions",
      "quality.table-checks",
      "quality.quarantine",
      "cleanse.trim",
      "cleanse.empty",
      "cleanse.map",
      "cleanse.case",
      "cleanse.default",
      "cleanse.timezone",
      "deduplicate",
    ]);
  });

  it("gives the values of an enumeration and * where any text is a value", () => {
    expect(intentPaths["load.mode"]).toEqual(["files", "incremental", "changes", "full"]);
    expect(intentPaths["load.cursor"]).toEqual(["*"]);
    expect(intentPaths.audit).toHaveLength(9);
    expect(intentPaths["storage.features"]).toHaveLength(5);
    expect(intentPaths["operations.alerts"]).toEqual(["failure", "slow"]);
    expect(intentPaths["operations.schedule"]).toEqual(["project", "flow"]);
    expect(intentPaths.rescued).toEqual(["true"]);
  });

  it("gives the rule kinds and actions as the quality paths' values", () => {
    expect(intentPaths["quality.rules"]).toEqual([
      "notNull",
      "in",
      "notIn",
      "pattern",
      "length",
      "range",
      "multipleOf",
      "items",
    ]);
    expect(intentPaths["quality.actions"]).toEqual(["warn", "drop", "fail"]);
    expect(intentPaths["cleanse.timezone"]).toEqual(["true"]);
    expect(intentPaths.deduplicate).toEqual(["true"]);
  });
});

describe("a layer object", () => {
  it("is refused at its place in the standard when it has no name", () => {
    const files = {
      ...minimal,
      "standard.yaml": [
        "apiVersion: ingestron.io/v1",
        "kind: Standard",
        "id: acme",
        "packs: [test@1]",
        "layers:",
        "  - { history: none }",
        "",
      ].join("\n"),
    };
    const result = resolveDefinitions(memoryFiles(files), {
      packs: [testPack],
      environment: "dev",
    });
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toMatchObject([
      {
        severity: "error",
        message: 'layers[0] needs "name".',
        location: { file: "standard.yaml", line: 6, column: 5 },
      },
    ]);
  });
});
